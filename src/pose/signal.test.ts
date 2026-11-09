import { describe, expect, it } from 'vitest';
import { PoseRatioSmoother, summarizeCalibrationHold } from './signal';

describe('camera signal handling', () => {
  it('smooths by elapsed time rather than by frame count', () => {
    const shortFrames = new PoseRatioSmoother();
    const longFrame = new PoseRatioSmoother();
    shortFrames.update(0, 0);
    longFrame.update(0, 0);
    shortFrames.update(1, 50);
    expect(shortFrames.update(1, 100)).toBeCloseTo(longFrame.update(1, 100)!);
  });

  it('resets after tracking loss instead of smoothing against an old position', () => {
    const smoother = new PoseRatioSmoother();
    smoother.update(0.5, 0);
    expect(smoother.update(2, 700)).toBe(2);
    smoother.reset();
    expect(smoother.update(0.2, 750)).toBe(0.2);
  });

  it('rejects invalid input and ignores out-of-order timestamps', () => {
    const smoother = new PoseRatioSmoother();
    smoother.update(0.5, 100);
    expect(smoother.update(1, 50)).toBe(0.5);
    expect(smoother.update(Number.NaN, 150)).toBeNull();
    expect(smoother.update(0.1, 200)).toBe(0.1);
  });

  it('accepts a still hold and rejects substantial movement', () => {
    const still = summarizeCalibrationHold([1, 1.02, 0.98, 1.01, 0.99]);
    expect(still?.stable).toBe(true);
    expect(still?.value).toBe(1);
    expect(summarizeCalibrationHold([0.4, 0.5, 0.7, 0.9, 1.1])?.stable).toBe(false);
  });

  it('needs enough finite calibration samples', () => {
    expect(summarizeCalibrationHold([1, 1, 1, 1])).toBeNull();
    expect(summarizeCalibrationHold([1, 1, 1, 1, Number.NaN])).toBeNull();
  });
});
