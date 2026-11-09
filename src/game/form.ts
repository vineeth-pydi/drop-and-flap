import type { PoseLandmark } from '../pose/types';

export type FormVariant = 'standard' | 'knees';
export type FormSide = 'left' | 'right';
export type FormPhase = 'seek-top' | 'top' | 'descending' | 'bottom' | 'ascending';

/** Experimental engineering rules, not a clinical or measured accuracy standard. */
export const FORM_THRESHOLDS = {
  visibility: 0.6,
  pairedShoulderVisibility: 0.5,
  minimumSegmentLength: 0.025,
  minimumTorsoLength: 0.08,
  maximumShoulderTorsoRatio: 0.65,
  maximumBodyTilt: 35,
  maximumWristAboveShoulderTorsoRatio: 0.1,
  topElbow: 160,
  bottomElbow: 100,
  topExitElbow: 150,
  bottomExitElbow: 110,
  minimumBodyAngle: 165,
  minimumKneeAngle: 155,
  minimumCycleMs: 650,
  minimumDescentMs: 250,
  minimumAscentMs: 250,
  maximumTrackingGapMs: 500,
  badFramesToReject: 3,
} as const;

export interface FormAssessment {
  trackable: boolean;
  side: FormSide | null;
  elbowAngle: number | null;
  bodyAngle: number | null;
  kneeAngle: number | null;
  progress: number | null;
  alignment: 'aligned' | 'hips-raised' | 'hips-sagging' | 'unknown';
  atTop: boolean;
  atBottom: boolean;
  issues: string[];
  cue: string;
}

interface Point { x: number; y: number }
interface Chain {
  side: FormSide;
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  hip: Point;
  knee: Point;
  ankle: Point | null;
}

const jointIndices = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
} as const;

function unknown(cue: string): FormAssessment {
  return { trackable: false, side: null, elbowAngle: null, bodyAngle: null, kneeAngle: null,
    progress: null, alignment: 'unknown', atTop: false, atBottom: false, issues: [cue], cue };
}

function confidence(landmark: PoseLandmark | undefined): number {
  if (!landmark || !Number.isFinite(landmark.visibility)) return 0;
  const presence = (landmark as PoseLandmark & { presence?: number }).presence;
  if (presence !== undefined && !Number.isFinite(presence)) return 0;
  return Math.min(landmark.visibility ?? 0, presence ?? landmark.visibility ?? 0);
}

function visiblePoint(landmark: PoseLandmark | undefined, aspectRatio: number, minimum: number = FORM_THRESHOLDS.visibility): Point | null {
  if (!landmark || confidence(landmark) < minimum || !Number.isFinite(landmark.x)
    || !Number.isFinite(landmark.y) || landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) return null;
  return { x: landmark.x * aspectRatio, y: landmark.y };
}

function distance(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }

function jointAngle(a: Point, joint: Point, b: Point): number | null {
  const first = distance(a, joint);
  const second = distance(b, joint);
  if (Math.min(first, second) < FORM_THRESHOLDS.minimumSegmentLength) return null;
  const cosine = ((a.x - joint.x) * (b.x - joint.x) + (a.y - joint.y) * (b.y - joint.y)) / (first * second);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

function readChain(landmarks: readonly PoseLandmark[], aspectRatio: number, side: FormSide, variant: FormVariant): Chain | null {
  const indices = jointIndices[side];
  const shoulder = visiblePoint(landmarks[indices.shoulder], aspectRatio);
  const elbow = visiblePoint(landmarks[indices.elbow], aspectRatio);
  const wrist = visiblePoint(landmarks[indices.wrist], aspectRatio);
  const hip = visiblePoint(landmarks[indices.hip], aspectRatio);
  const knee = visiblePoint(landmarks[indices.knee], aspectRatio);
  const ankle = visiblePoint(landmarks[indices.ankle], aspectRatio);
  if (!shoulder || !elbow || !wrist || !hip || !knee || (variant === 'standard' && !ankle)) return null;
  return { side, shoulder, elbow, wrist, hip, knee, ankle };
}

/**
 * Assesses a visible side profile in aspect-corrected 2D coordinates.
 * A hidden far shoulder is allowed. When both shoulders are visible, excessive
 * shoulder span vetoes a frontal view. Neither gate establishes true 3D form.
 */
export function assessPushupForm(landmarks: readonly PoseLandmark[], aspectRatio: number, variant: FormVariant): FormAssessment {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0 || (variant !== 'standard' && variant !== 'knees')) {
    return unknown('A valid side-view camera image is needed.');
  }
  // Prefer the same complete left chain rather than switching sides whenever
  // two nearly equal confidence values change. The counter clears on a switch.
  const chain = readChain(landmarks, aspectRatio, 'left', variant)
    ?? readChain(landmarks, aspectRatio, 'right', variant);
  if (!chain) return unknown(variant === 'knees'
    ? 'Show one shoulder, elbow, wrist, hip and knee clearly from the side.'
    : 'Show one shoulder, elbow, wrist, hip, knee and ankle clearly from the side.');
  const { shoulder, elbow, wrist, hip, knee } = chain;
  const endpoint = variant === 'standard' ? chain.ankle! : knee;
  const torsoLength = distance(shoulder, hip);
  if (torsoLength < FORM_THRESHOLDS.minimumTorsoLength || distance(shoulder, endpoint) < FORM_THRESHOLDS.minimumTorsoLength) {
    return unknown('Move into a clear side view so the body joints are separated.');
  }
  const oppositeShoulder = visiblePoint(landmarks[jointIndices[chain.side === 'left' ? 'right' : 'left'].shoulder],
    aspectRatio, FORM_THRESHOLDS.pairedShoulderVisibility);
  if (oppositeShoulder && distance(shoulder, oppositeShoulder) / torsoLength > FORM_THRESHOLDS.maximumShoulderTorsoRatio) {
    return unknown('Turn sideways to the camera; a front view cannot assess this form check.');
  }
  const tilt = Math.atan2(Math.abs(endpoint.y - shoulder.y), Math.abs(endpoint.x - shoulder.x)) * 180 / Math.PI;
  if (tilt > FORM_THRESHOLDS.maximumBodyTilt) {
    return unknown('Set up sideways with your body roughly horizontal in the frame.');
  }
  // This excludes an obviously upside-down arm/support view, not all possible
  // non-pushup motions. A 2D image cannot establish contact with the floor.
  if (wrist.y < shoulder.y - torsoLength * FORM_THRESHOLDS.maximumWristAboveShoulderTorsoRatio) {
    return unknown('Keep the camera upright and show your hands supporting below your shoulders.');
  }
  const elbowAngle = jointAngle(shoulder, elbow, wrist);
  const bodyAngle = jointAngle(shoulder, hip, knee);
  const kneeAngle = variant === 'standard' ? jointAngle(hip, knee, endpoint) : null;
  if (elbowAngle === null || bodyAngle === null || (variant === 'standard' && kneeAngle === null)
    || Math.abs(knee.x - shoulder.x) < FORM_THRESHOLDS.minimumSegmentLength) {
    return unknown('The joint geometry is unclear. Reposition sideways and keep the full body visible.');
  }
  const aligned = bodyAngle + 1e-6 >= FORM_THRESHOLDS.minimumBodyAngle;
  const hipLineY = shoulder.y + (knee.y - shoulder.y) * (hip.x - shoulder.x) / (knee.x - shoulder.x);
  const alignment = aligned ? 'aligned' : hip.y < hipLineY ? 'hips-raised' : 'hips-sagging';
  const issues: string[] = [];
  if (alignment === 'hips-raised') issues.push('Lower your hips to line up your shoulders, hips and knees.');
  if (alignment === 'hips-sagging') issues.push('Lift your hips to line up your shoulders, hips and knees.');
  if (kneeAngle !== null && kneeAngle + 1e-6 < FORM_THRESHOLDS.minimumKneeAngle) {
    issues.push('Keep your knees straight for Standard, or choose the Knees variation.');
  }
  const atTop = elbowAngle + 1e-6 >= FORM_THRESHOLDS.topElbow;
  const atBottom = elbowAngle <= FORM_THRESHOLDS.bottomElbow + 1e-6;
  return {
    trackable: true, side: chain.side, elbowAngle, bodyAngle, kneeAngle,
    progress: Math.max(0, Math.min(1, (FORM_THRESHOLDS.topElbow - elbowAngle)
      / (FORM_THRESHOLDS.topElbow - FORM_THRESHOLDS.bottomElbow))),
    alignment, atTop, atBottom, issues,
    cue: issues[0] ?? (atTop ? 'Top position. Lower with control.' : atBottom
      ? 'Elbow bend reached. Return to extended arms.' : 'Bend your elbows with control, then return to extended arms.'),
  };
}

/**
 * Counts full elbow cycles with the experimental alignment rules above.
 * Three consecutive bad-form observations invalidate a cycle; the final top
 * must also be aligned. Missing geometry, side switches and pauses discard it.
 */
export class FormRepCounter {
  count = 0;
  attempts = 0;
  rejected = 0;
  phase: FormPhase = 'seek-top';
  lastFeedback = 'Start with straight arms at the top.';

  private side: FormSide | null = null;
  private lastTime: number | null = null;
  private startedAt = 0;
  private lastBottomAt = 0;
  private ascentStartedAt = 0;
  private badFrames = 0;
  private invalidReason: string | null = null;

  reset(): void {
    this.count = 0;
    this.attempts = 0;
    this.rejected = 0;
    this.lastFeedback = 'Start with straight arms at the top.';
    this.discardPartial();
  }

  discardPartial(): void {
    this.phase = 'seek-top';
    this.side = null;
    this.lastTime = null;
    this.startedAt = 0;
    this.lastBottomAt = 0;
    this.ascentStartedAt = 0;
    this.badFrames = 0;
    this.invalidReason = null;
  }

  private arm(timeMs: number): void {
    this.phase = 'top';
    this.startedAt = timeMs;
    this.lastBottomAt = 0;
    this.ascentStartedAt = 0;
    this.badFrames = 0;
    this.invalidReason = null;
  }

  private observeForm(assessment: FormAssessment): void {
    const issue = assessment.issues[0] ?? (assessment.alignment !== 'aligned' ? 'Keep your body aligned throughout the rep.' : null);
    if (!issue) this.badFrames = 0;
    else if (++this.badFrames >= FORM_THRESHOLDS.badFramesToReject) this.invalidReason ??= issue;
  }

  private finish(assessment: FormAssessment, timeMs: number): boolean {
    const reason = this.invalidReason ?? assessment.issues[0]
      ?? (assessment.alignment !== 'aligned' ? 'Keep your body aligned at the top.' : null)
      ?? (timeMs - this.startedAt < FORM_THRESHOLDS.minimumCycleMs ? 'Move more slowly through the full cycle.' : null)
      ?? (timeMs - this.ascentStartedAt < FORM_THRESHOLDS.minimumAscentMs ? 'Press up with control rather than bouncing.' : null);
    this.attempts += 1;
    if (reason) {
      this.rejected += 1;
      this.lastFeedback = `Not counted: ${reason}`;
    } else {
      this.count += 1;
      this.lastFeedback = 'Rep counted. Elbow bend, arm extension and body-line checks met.';
    }
    this.arm(timeMs);
    return reason === null;
  }

  update(assessment: FormAssessment, timestampMs: number): boolean {
    if (!Number.isFinite(timestampMs) || timestampMs < 0 || (this.lastTime !== null && timestampMs <= this.lastTime)) return false;
    if (!assessment.trackable || assessment.side === null || assessment.elbowAngle === null
      || assessment.progress === null || !Number.isFinite(assessment.elbowAngle) || !Number.isFinite(assessment.progress)) {
      this.discardPartial();
      this.lastFeedback = assessment.cue || 'Tracking is unclear. Reposition and start at the top.';
      return false;
    }
    if ((this.lastTime !== null && timestampMs - this.lastTime > FORM_THRESHOLDS.maximumTrackingGapMs)
      || (this.side !== null && this.side !== assessment.side)) {
      this.discardPartial();
      this.lastFeedback = 'Tracking changed. Start a fresh rep with straight arms.';
    }
    this.side = assessment.side;
    this.lastTime = timestampMs;
    if (this.phase === 'seek-top') {
      if (assessment.atTop) {
        this.arm(timestampMs);
        this.observeForm(assessment);
        this.lastFeedback = assessment.cue;
      } else this.lastFeedback = 'Straighten your arms at the top before starting a rep.';
      return false;
    }
    if (this.phase === 'top') {
      if (assessment.elbowAngle > FORM_THRESHOLDS.topExitElbow) {
        this.startedAt = timestampMs;
        if (assessment.issues.length === 0 && assessment.alignment === 'aligned') {
          this.badFrames = 0;
          this.invalidReason = null;
        } else this.observeForm(assessment);
        // The live assessment cue is displayed separately. Keep the completed
        // attempt's result readable while the next top position is held.
        return false;
      }
      this.phase = 'descending';
    }
    this.observeForm(assessment);
    if (this.phase === 'descending') {
      if (assessment.atTop) {
        this.arm(timestampMs);
        this.lastFeedback = 'Lower farther before returning to the top. No rep counted.';
      } else if (assessment.atBottom) {
        if (timestampMs - this.startedAt < FORM_THRESHOLDS.minimumDescentMs) {
          this.invalidReason ??= 'Lower with control rather than dropping or bouncing.';
        }
        this.phase = 'bottom';
        this.lastBottomAt = timestampMs;
      }
      return false;
    }
    if (this.phase === 'bottom') {
      if (assessment.elbowAngle <= FORM_THRESHOLDS.bottomExitElbow) {
        this.lastBottomAt = timestampMs;
        return false;
      }
      this.ascentStartedAt = this.lastBottomAt;
      this.phase = 'ascending';
    }
    if (assessment.atTop) return this.finish(assessment, timestampMs);
    if (assessment.atBottom) {
      this.phase = 'bottom';
      this.lastBottomAt = timestampMs;
    }
    return false;
  }
}
