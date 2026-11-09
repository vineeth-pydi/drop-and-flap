import { describe, expect, it } from 'vitest';
import type { PoseLandmark } from '../pose/types';
import { FORM_THRESHOLDS, FormRepCounter, assessPushupForm, type FormSide, type FormVariant } from './form';

const indices = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};
interface PoseOptions { side?: FormSide; aspect?: number; mirror?: boolean; hipY?: number; bentKnee?: boolean }

/** Synthetic geometry verifies rules, not MediaPipe or human exercise accuracy. */
function pose(elbowAngle = 170, options: PoseOptions = {}): PoseLandmark[] {
  const aspect = options.aspect ?? 4 / 3;
  const side = options.side ?? 'left';
  const ids = indices[side];
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const point = (x: number, y: number): PoseLandmark => ({
    x: options.mirror ? 1 - x / aspect : x / aspect, y, visibility: 0.99,
  });
  const radians = elbowAngle * Math.PI / 180;
  landmarks[ids.shoulder] = point(0.2, 0.35);
  landmarks[ids.elbow] = point(0.2, 0.5);
  landmarks[ids.wrist] = point(0.2 + 0.15 * Math.sin(radians), 0.5 - 0.15 * Math.cos(radians));
  landmarks[ids.hip] = point(0.65, options.hipY ?? 0.35);
  landmarks[ids.knee] = point(1, 0.35);
  landmarks[ids.ankle] = point(options.bentKnee ? 1.1 : 1.3, options.bentKnee ? 0.2 : 0.35);
  return landmarks;
}

function assessment(angle = 170, options: PoseOptions = {}, variant: FormVariant = 'standard') {
  return assessPushupForm(pose(angle, options), options.aspect ?? 4 / 3, variant);
}

describe('experimental 2D pushup form geometry', () => {
  it('measures elbow, body and knee angles on a complete side view', () => {
    const result = assessment(170);
    expect(result.trackable).toBe(true);
    expect(result.side).toBe('left');
    expect(result.elbowAngle).toBeCloseTo(170);
    expect(result.bodyAngle).toBeCloseTo(180);
    expect(result.kneeAngle).toBeCloseTo(180);
    expect(result.alignment).toBe('aligned');
    expect(result.atTop).toBe(true);
    expect(result.atBottom).toBe(false);
    expect(result.progress).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('uses aspect-corrected coordinates rather than distorted normalized angles', () => {
    expect(assessment(135, { aspect: 1.8 }).elbowAngle).toBeCloseTo(135);
    const distorted = assessPushupForm(pose(135, { aspect: 1.8 }), 1, 'standard');
    expect(distorted.elbowAngle).not.toBeCloseTo(135);
  });

  it('keeps the same geometry and raised/sagging meaning after horizontal mirroring', () => {
    for (const hipY of [0.21, 0.35, 0.49]) {
      const original = assessment(90, { hipY });
      const mirrored = assessment(90, { hipY, mirror: true });
      expect(mirrored.elbowAngle).toBeCloseTo(original.elbowAngle!);
      expect(mirrored.bodyAngle).toBeCloseTo(original.bodyAngle!);
      expect(mirrored.alignment).toBe(original.alignment);
      expect(mirrored.issues).toEqual(original.issues);
    }
  });

  it('uses a complete right chain when the left side is occluded', () => {
    const right = assessment(90, { side: 'right' });
    expect(right.trackable).toBe(true);
    expect(right.side).toBe('right');
    expect(right.atBottom).toBe(true);
  });

  it('allows a hidden far shoulder and ignores the nose', () => {
    const landmarks = pose();
    landmarks[0] = { x: 2, y: -1, visibility: 0 };
    landmarks[12] = { x: 0.9, y: 0.8, visibility: 0.1 };
    expect(assessPushupForm(landmarks, 4 / 3, 'standard').trackable).toBe(true);
  });

  it('vetoes a frontal view when both shoulders are visibly spread', () => {
    const landmarks = pose();
    landmarks[12] = { x: 0.65 / (4 / 3), y: 0.35, visibility: 0.99 };
    const result = assessPushupForm(landmarks, 4 / 3, 'standard');
    expect(result.trackable).toBe(false);
    expect(result.alignment).toBe('unknown');
    expect(result.cue).toMatch(/front view/i);
    expect(result.progress).toBeNull();
  });

  it('rejects an upright body even when one complete chain is visible', () => {
    const landmarks = pose();
    landmarks[11] = { x: 0.3, y: 0.15, visibility: 0.99 };
    landmarks[23] = { x: 0.3, y: 0.4, visibility: 0.99 };
    landmarks[25] = { x: 0.3, y: 0.65, visibility: 0.99 };
    landmarks[27] = { x: 0.3, y: 0.9, visibility: 0.99 };
    expect(assessPushupForm(landmarks, 4 / 3, 'standard').trackable).toBe(false);
  });

  it('rejects an obviously upside-down arm support view while accepting mirrored pushup arms', () => {
    const landmarks = pose();
    landmarks[13] = { x: landmarks[11].x, y: 0.2, visibility: 0.99 };
    landmarks[15] = { x: landmarks[11].x, y: 0.05, visibility: 0.99 };
    const result = assessPushupForm(landmarks, 4 / 3, 'standard');
    expect(result.trackable).toBe(false);
    expect(result.cue).toMatch(/hands supporting below/i);
    for (const mirror of [true, false]) {
      expect(assessment(170, { mirror }).trackable).toBe(true);
      expect(assessment(90, { mirror }).trackable).toBe(true);
    }
  });

  it('requires visible joints in the selected chain and rejects clipped geometry', () => {
    for (const joint of [11, 13, 15, 23, 25, 27]) {
      const landmarks = pose();
      landmarks[joint].visibility = FORM_THRESHOLDS.visibility - 0.01;
      expect(assessPushupForm(landmarks, 4 / 3, 'standard').trackable).toBe(false);
    }
    const clipped = pose();
    clipped[23].x = 1.1;
    expect(assessPushupForm(clipped, 4 / 3, 'standard').trackable).toBe(false);
  });

  it('rejects weak landmark presence as well as visibility', () => {
    const landmarks = pose();
    landmarks[13] = { ...landmarks[13], presence: 0.4 };
    expect(assessPushupForm(landmarks, 4 / 3, 'standard').trackable).toBe(false);
    landmarks[13].presence = Number.NaN;
    expect(assessPushupForm(landmarks, 4 / 3, 'standard').trackable).toBe(false);
  });

  it('reports raised and sagging hips rather than treating elbow depth as a form pass', () => {
    const raised = assessment(90, { hipY: 0.21 });
    const sagging = assessment(90, { hipY: 0.49 });
    expect(raised.atBottom).toBe(true);
    expect(raised.alignment).toBe('hips-raised');
    expect(raised.issues[0]).toMatch(/lower your hips/i);
    expect(sagging.alignment).toBe('hips-sagging');
    expect(sagging.issues[0]).toMatch(/lift your hips/i);
  });

  it('distinguishes knees support from the Standard straight-knee requirement', () => {
    const standard = assessment(90, { bentKnee: true });
    const knees = assessment(90, { bentKnee: true }, 'knees');
    expect(standard.trackable).toBe(true);
    expect(standard.kneeAngle).toBeLessThan(155);
    expect(standard.issues.join(' ')).toMatch(/knees straight/i);
    expect(knees.trackable).toBe(true);
    expect(knees.kneeAngle).toBeNull();
    expect(knees.issues).toEqual([]);
  });

  it('does not require ankles for Knees, but still requires the knee endpoint', () => {
    const landmarks = pose();
    landmarks[27].visibility = 0;
    expect(assessPushupForm(landmarks, 4 / 3, 'knees').trackable).toBe(true);
    expect(assessPushupForm(landmarks, 4 / 3, 'standard').trackable).toBe(false);
    landmarks[25].visibility = 0;
    expect(assessPushupForm(landmarks, 4 / 3, 'knees').trackable).toBe(false);
  });

  it('exposes fixed elbow depth thresholds and bounded game progress', () => {
    expect(assessment(165).atTop).toBe(true);
    expect(assessment(160).atTop).toBe(true);
    expect(assessment(155).atTop).toBe(false);
    expect(assessment(110).atBottom).toBe(false);
    expect(assessment(95).atBottom).toBe(true);
    expect(assessment(100).atBottom).toBe(true);
    expect(assessment(130).progress).toBeCloseTo(0.5);
    expect(assessment(80).progress).toBe(1);
  });

  it('returns unknown for missing, nonfinite or collapsed geometry', () => {
    expect(assessPushupForm([], 4 / 3, 'standard').trackable).toBe(false);
    expect(assessPushupForm(pose(), Number.NaN, 'standard').trackable).toBe(false);
    const collapsed = pose();
    collapsed[15] = { ...collapsed[13] };
    const result = assessPushupForm(collapsed, 4 / 3, 'standard');
    expect(result.trackable).toBe(false);
    expect(result.atTop).toBe(false);
    expect(result.atBottom).toBe(false);
    expect(result.elbowAngle).toBeNull();
  });
});

describe('form-specific full-cycle counter', () => {
  it('counts a timed, aligned top-bottom-top elbow cycle only once', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(135), 200);
    counter.update(assessment(90), 400);
    counter.update(assessment(130), 600);
    expect(counter.update(assessment(170), 900)).toBe(true);
    expect(counter.count).toBe(1);
    expect(counter.attempts).toBe(1);
    expect(counter.rejected).toBe(0);
    expect(counter.update(assessment(170), 1000)).toBe(false);
    expect(counter.count).toBe(1);
  });

  it('preserves accepted and rejected attempt feedback through later top frames', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(90), 400);
    expect(counter.update(assessment(170), 800)).toBe(true);
    const accepted = counter.lastFeedback;
    expect(accepted).toMatch(/^rep counted/i);
    for (const time of [850, 900, 950]) {
      counter.update(assessment(170), time);
      expect(counter.lastFeedback).toBe(accepted);
    }
    counter.update(assessment(90, { hipY: 0.49 }), 1250);
    counter.update(assessment(90, { hipY: 0.49 }), 1300);
    counter.update(assessment(90, { hipY: 0.49 }), 1350);
    counter.update(assessment(130), 1550);
    expect(counter.update(assessment(170), 1850)).toBe(false);
    const rejected = counter.lastFeedback;
    expect(rejected).toMatch(/^not counted:.*hips/i);
    for (const time of [1900, 1950, 2000, 2100, 2200]) {
      counter.update(assessment(170), time);
      expect(counter.lastFeedback).toBe(rejected);
    }
    expect(counter.count).toBe(1);
    expect(counter.rejected).toBe(1);
  });

  it('requires a starting top; a bottom-to-top movement alone cannot count', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(90), 0);
    expect(counter.update(assessment(170), 400)).toBe(false);
    expect(counter.count).toBe(0);
    expect(counter.attempts).toBe(0);
  });

  it('rejects shallow cycles and top-threshold jitter without crediting attempts', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(159), 150);
    counter.update(assessment(163), 300);
    counter.update(assessment(130), 500);
    counter.update(assessment(110), 700);
    expect(counter.update(assessment(170), 1000)).toBe(false);
    expect(counter.count).toBe(0);
    expect(counter.attempts).toBe(0);
    expect(counter.lastFeedback).toMatch(/lower farther/i);
  });

  it('rejects completed cycles with repeated hip faults and retains their reason', () => {
    for (const hipY of [0.21, 0.49]) {
      const counter = new FormRepCounter();
      counter.update(assessment(170), 0);
      counter.update(assessment(135), 200);
      counter.update(assessment(90, { hipY }), 400);
      counter.update(assessment(90, { hipY }), 450);
      counter.update(assessment(95, { hipY }), 500);
      counter.update(assessment(130), 700);
      expect(counter.update(assessment(170), 1000)).toBe(false);
      expect(counter.count).toBe(0);
      expect(counter.attempts).toBe(1);
      expect(counter.rejected).toBe(1);
      expect(counter.lastFeedback).toMatch(/not counted:.*hips/i);
    }
  });

  it('rejects a Standard cycle with bent knees, while Knees can accept the same arm cycle', () => {
    for (const variant of ['standard', 'knees'] as const) {
      const counter = new FormRepCounter();
      for (const [angle, time] of [[170, 0], [135, 200], [90, 400], [130, 600], [170, 900]]) {
        counter.update(assessment(angle, { bentKnee: true }, variant), time);
      }
      expect(counter.count).toBe(variant === 'knees' ? 1 : 0);
      expect(counter.rejected).toBe(variant === 'knees' ? 0 : 1);
    }
  });

  it('tolerates two transient alignment samples but still requires a good final top', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(135), 200);
    counter.update(assessment(90, { hipY: 0.21 }), 400);
    counter.update(assessment(90, { hipY: 0.21 }), 450);
    counter.update(assessment(90), 500);
    counter.update(assessment(130), 700);
    expect(counter.update(assessment(170), 1000)).toBe(true);
    counter.update(assessment(90), 1400);
    expect(counter.update(assessment(170, { hipY: 0.49 }), 1800)).toBe(false);
    expect(counter.count).toBe(1);
    expect(counter.rejected).toBe(1);
  });

  it('rejects rapid full cycles and a fast descent despite a later slow return', () => {
    const rapid = new FormRepCounter();
    rapid.update(assessment(170), 0);
    rapid.update(assessment(90), 100);
    expect(rapid.update(assessment(170), 200)).toBe(false);
    expect(rapid.rejected).toBe(1);
    const dropped = new FormRepCounter();
    dropped.update(assessment(170), 0);
    dropped.update(assessment(90), 200);
    dropped.update(assessment(130), 400);
    expect(dropped.update(assessment(170), 800)).toBe(false);
    expect(dropped.lastFeedback).toMatch(/lower with control/i);
  });

  it('does not let a long bottom rest satisfy the minimum actual ascent interval', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(90), 400);
    counter.update(assessment(90), 700);
    counter.update(assessment(90), 1000);
    expect(counter.update(assessment(170), 1100)).toBe(false);
    expect(counter.lastFeedback).toMatch(/press up with control/i);
  });

  it('discards a side switch rather than joining two people or two limb cycles', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(90), 400);
    expect(counter.update(assessment(170, { side: 'right' }), 800)).toBe(false);
    expect(counter.attempts).toBe(0);
    counter.update(assessment(90, { side: 'right' }), 1200);
    expect(counter.update(assessment(170, { side: 'right' }), 1600)).toBe(true);
  });

  it('discards occlusion, a tracking gap and an explicit pause without losing completed counts', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(90), 400);
    counter.update(assessment(170), 800);
    counter.update(assessment(90), 1200);
    counter.update(assessPushupForm([], 4 / 3, 'standard'), 1300);
    expect(counter.update(assessment(170), 1400)).toBe(false);
    counter.update(assessment(90), 1800);
    expect(counter.update(assessment(170), 2400)).toBe(false);
    counter.update(assessment(90), 2800);
    counter.discardPartial();
    expect(counter.update(assessment(170), 2900)).toBe(false);
    expect(counter.count).toBe(1);
    expect(counter.attempts).toBe(1);
    expect(counter.rejected).toBe(0);
  });

  it('ignores duplicate/reversed/invalid timestamps and cannot inflate bad-frame streaks', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    const noisy = assessment(90, { hipY: 0.21 });
    counter.update(noisy, 400);
    for (let index = 0; index < 5; index += 1) counter.update(noisy, 400);
    counter.update(noisy, 399);
    counter.update(noisy, Number.NaN);
    counter.update(noisy, -1);
    counter.update(assessment(130), 600);
    expect(counter.update(assessment(170), 900)).toBe(true);
    expect(counter.count).toBe(1);
  });

  it('cannot count head bobbing when the elbow angle stays at the top', () => {
    const counter = new FormRepCounter();
    for (let index = 0; index < 10; index += 1) {
      const landmarks = pose();
      landmarks[0] = { x: 0.3, y: index % 2 ? 0.1 : 0.9, visibility: 0.99 };
      counter.update(assessPushupForm(landmarks, 4 / 3, 'standard'), index * 100);
    }
    expect(counter.count).toBe(0);
    expect(counter.attempts).toBe(0);
  });

  it('resets totals and requires a new top', () => {
    const counter = new FormRepCounter();
    counter.update(assessment(170), 0);
    counter.update(assessment(90), 400);
    counter.update(assessment(170), 800);
    counter.reset();
    expect(counter.count).toBe(0);
    expect(counter.attempts).toBe(0);
    expect(counter.rejected).toBe(0);
    expect(counter.phase).toBe('seek-top');
    expect(counter.update(assessment(90), 0)).toBe(false);
  });
});
