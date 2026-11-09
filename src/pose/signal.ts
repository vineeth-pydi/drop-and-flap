/** Light frame-rate-independent smoothing for the camera controller. */
export class PoseRatioSmoother {
  private previous: { value: number; timestamp: number } | null = null;

  constructor(private readonly timeConstantMs = 90) {}

  reset(): void {
    this.previous = null;
  }

  update(value: number, timestamp: number): number | null {
    if (!Number.isFinite(value) || !Number.isFinite(timestamp)) {
      this.reset();
      return null;
    }
    const previous = this.previous;
    if (!previous || timestamp - previous.timestamp > 500) {
      this.previous = { value, timestamp };
      return value;
    }
    if (timestamp <= previous.timestamp) return previous.value;
    const alpha = 1 - Math.exp(-(timestamp - previous.timestamp) / this.timeConstantMs);
    const smoothed = previous.value + alpha * (value - previous.value);
    this.previous = { value: smoothed, timestamp };
    return smoothed;
  }
}

/**
 * An engineering stillness guard for the final second of a calibration hold.
 * It is not a validated measure of exercise form or a device accuracy claim.
 */
export function summarizeCalibrationHold(values: readonly number[]): {
  value: number;
  standardDeviation: number;
  stable: boolean;
} | null {
  if (values.length < 5 || values.some((value) => !Number.isFinite(value))) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const value = sorted[Math.floor(sorted.length / 2)];
  const mean = values.reduce((sum, sample) => sum + sample, 0) / values.length;
  const standardDeviation = Math.sqrt(
    values.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / values.length,
  );
  return { value, standardDeviation, stable: standardDeviation <= 0.08 };
}
