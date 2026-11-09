export type RepPhase = 'seek-top' | 'top' | 'descending' | 'bottom' | 'ascending';

export interface RepCounterOptions {
  topThreshold?: number;
  bottomThreshold?: number;
  hysteresis?: number;
  minimumRepMs?: number;
  minimumDescentMs?: number;
  minimumAscentMs?: number;
  trackingGapMs?: number;
}

/** A full, timed top → bottom → top cycle counts once. */
export class RepCounter {
  count = 0;
  phase: RepPhase = 'seek-top';

  private readonly topThreshold: number;
  private readonly bottomThreshold: number;
  private readonly hysteresis: number;
  private readonly minimumRepMs: number;
  private readonly minimumDescentMs: number;
  private readonly minimumAscentMs: number;
  private readonly trackingGapMs: number;
  private startedAt = 0;
  private bottomAt = 0;
  private lastTime: number | null = null;

  constructor(options: RepCounterOptions = {}) {
    this.topThreshold = options.topThreshold ?? 0.2;
    this.bottomThreshold = options.bottomThreshold ?? 0.8;
    this.hysteresis = options.hysteresis ?? 0.1;
    this.minimumRepMs = options.minimumRepMs ?? 650;
    this.minimumDescentMs = options.minimumDescentMs ?? 250;
    this.minimumAscentMs = options.minimumAscentMs ?? 250;
    this.trackingGapMs = options.trackingGapMs ?? 1800;
    if (this.topThreshold < 0 || this.bottomThreshold > 1
      || this.bottomThreshold - this.topThreshold <= this.hysteresis * 2
      || this.hysteresis < 0 || this.minimumRepMs < 0
      || this.minimumDescentMs < 0 || this.minimumAscentMs < 0 || this.trackingGapMs <= 0
      || !Object.values(options).every((value) => value === undefined || Number.isFinite(value))) {
      throw new RangeError('Rep thresholds and durations must form a valid top-to-bottom range.');
    }
  }

  reset(): void {
    this.count = 0;
    this.discardPartial();
  }

  /** A pause or camera interruption requires a fresh cycle, retaining full reps. */
  discardPartial(): void {
    this.phase = 'seek-top';
    this.startedAt = 0;
    this.bottomAt = 0;
    this.lastTime = null;
  }

  private armTop(timeMs: number): void {
    this.phase = 'top';
    this.startedAt = timeMs;
    this.bottomAt = 0;
  }

  private finish(timeMs: number): boolean {
    const valid = timeMs - this.startedAt >= this.minimumRepMs
      && timeMs - this.bottomAt >= this.minimumAscentMs;
    this.armTop(timeMs);
    if (valid) this.count += 1;
    return valid;
  }

  /** Returns true only on the frame that completes a valid rep. */
  update(progress: number, timeMs: number): boolean {
    if (!Number.isFinite(progress) || !Number.isFinite(timeMs) || timeMs < 0) return false;
    if (this.lastTime !== null && timeMs < this.lastTime) return false;
    if (this.lastTime !== null && timeMs - this.lastTime > this.trackingGapMs) {
      // After tracking loss, a fresh top is required. Never count a ghost rep.
      this.phase = 'seek-top';
      this.startedAt = 0;
      this.bottomAt = 0;
    }
    this.lastTime = timeMs;
    const value = Math.max(0, Math.min(1, progress));

    if (this.phase === 'seek-top') {
      if (value <= this.topThreshold) this.armTop(timeMs);
      return false;
    }
    if (this.phase === 'top') {
      if (value < this.topThreshold + this.hysteresis) {
        // Time spent resting at the top is not time spent descending.
        this.startedAt = timeMs;
        return false;
      }
      this.phase = 'descending';
    }
    if (this.phase === 'descending') {
      if (value <= this.topThreshold) this.armTop(timeMs);
      else if (value >= this.bottomThreshold) {
        if (timeMs - this.startedAt < this.minimumDescentMs) {
          this.phase = 'seek-top';
        } else {
          this.phase = 'bottom';
          this.bottomAt = timeMs;
        }
      }
      return false;
    }
    if (this.phase === 'bottom') {
      if (value <= this.topThreshold) return this.finish(timeMs);
      if (value <= this.bottomThreshold - this.hysteresis) this.phase = 'ascending';
      return false;
    }
    if (value <= this.topThreshold) return this.finish(timeMs);
    if (value >= this.bottomThreshold) this.phase = 'bottom';
    return false;
  }
}

export interface CalibrationResult {
  valid: boolean;
  difference: number;
  reason?: string;
}

export const MIN_CALIBRATION_RANGE = 0.1;

/** Pose ratios can increase or decrease during a push-up; both are supported. */
export function validateCalibration(top: number, bottom: number): CalibrationResult {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    return { valid: false, difference: 0, reason: 'A clear pose is needed at both positions.' };
  }
  const difference = Math.abs(bottom - top);
  if (difference < MIN_CALIBRATION_RANGE) {
    return { valid: false, difference, reason: 'Top and bottom are too similar. Move through your full comfortable range.' };
  }
  return { valid: true, difference };
}

/** Returns null for invalid calibration or missing pose data. */
export function normalizePoseRatio(value: number, top: number, bottom: number): number | null {
  if (!Number.isFinite(value) || !validateCalibration(top, bottom).valid) return null;
  return Math.max(0, Math.min(1, (value - top) / (bottom - top)));
}
