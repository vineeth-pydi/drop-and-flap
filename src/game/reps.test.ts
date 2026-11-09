import { describe, expect, it } from 'vitest';
import { RepCounter, normalizePoseRatio, validateCalibration } from './reps';

describe('rep counter', () => {
  it('counts one full top-bottom-top cycle and subsequent cycles', () => {
    const reps = new RepCounter();
    expect(reps.update(0, 0)).toBe(false);
    reps.update(0.5, 300);
    reps.update(1, 700);
    expect(reps.phase).toBe('bottom');
    reps.update(0.5, 1000);
    expect(reps.update(0, 1400)).toBe(true);
    expect(reps.count).toBe(1);
    expect(reps.update(0, 1500)).toBe(false);
    reps.update(1, 2000);
    expect(reps.update(0, 2500)).toBe(true);
    expect(reps.count).toBe(2);
  });

  it('requires a top before the first rep', () => {
    const reps = new RepCounter();
    reps.update(1, 0);
    reps.update(0.5, 500);
    expect(reps.update(0, 1000)).toBe(false);
    expect(reps.count).toBe(0);
    expect(reps.phase).toBe('top');
  });

  it('rejects half reps and threshold jitter', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    for (let index = 1; index <= 15; index += 1) reps.update(index % 2 ? 0.24 : 0.18, index * 100);
    expect(reps.phase).toBe('top');
    reps.update(0.65, 1800);
    reps.update(0.05, 2400);
    expect(reps.count).toBe(0);
    expect(reps.phase).toBe('top');
  });

  it('rejects rapid motion and a rapid bounce from the bottom', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    reps.update(1, 80);
    expect(reps.update(0, 160)).toBe(false);
    reps.update(1, 700);
    expect(reps.update(0, 720)).toBe(false);
    expect(reps.update(0, 1100)).toBe(false);
    expect(reps.count).toBe(0);
  });

  it('does not mistake resting at the top for a slow descent', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    reps.update(0, 1000);
    reps.update(1, 1010);
    expect(reps.phase).toBe('seek-top');
    expect(reps.update(0, 1500)).toBe(false);
    expect(reps.count).toBe(0);
  });

  it('uses bottom hysteresis without double counting', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    reps.update(0.85, 600);
    reps.update(0.76, 700);
    expect(reps.phase).toBe('bottom');
    reps.update(0.65, 800);
    expect(reps.phase).toBe('ascending');
    reps.update(0.83, 900);
    expect(reps.update(0.1, 1200)).toBe(true);
    for (let index = 13; index < 20; index += 1) reps.update(0.1, index * 100);
    expect(reps.count).toBe(1);
  });

  it('drops an incomplete cycle after tracking loss and ignores invalid times', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    reps.update(1, 700);
    reps.update(Number.NaN, 900);
    reps.update(0, Number.NaN);
    reps.update(0, -1);
    expect(reps.update(0, 4000)).toBe(false);
    expect(reps.count).toBe(0);
    reps.update(1, 4500);
    expect(reps.update(0, 4200)).toBe(false);
    expect(reps.update(0, 5000)).toBe(true);
  });

  it('resets count and cycle state', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    reps.update(1, 500);
    reps.update(0, 1000);
    reps.reset();
    expect(reps.count).toBe(0);
    expect(reps.phase).toBe('seek-top');
    expect(reps.update(1, 0)).toBe(false);
  });

  it('discards a partial rep across a short pause while retaining completed reps', () => {
    const reps = new RepCounter();
    reps.update(0, 0);
    reps.update(1, 500);
    expect(reps.update(0, 1000)).toBe(true);
    reps.update(1, 1600);
    expect(reps.phase).toBe('bottom');
    reps.discardPartial();
    expect(reps.phase).toBe('seek-top');
    expect(reps.count).toBe(1);
    // Returning to the top after a 100 ms pause cannot complete the old rep.
    expect(reps.update(0, 1700)).toBe(false);
    expect(reps.count).toBe(1);
    reps.update(1, 2300);
    expect(reps.update(0, 2900)).toBe(true);
    expect(reps.count).toBe(2);
  });

  it('rejects invalid threshold configurations', () => {
    expect(() => new RepCounter({ topThreshold: 0.8, bottomThreshold: 0.2 })).toThrow(RangeError);
    expect(() => new RepCounter({ minimumRepMs: Number.NaN })).toThrow(RangeError);
    expect(() => new RepCounter({ trackingGapMs: 0 })).toThrow(RangeError);
  });
});

describe('calibration', () => {
  it('normalizes both increasing and decreasing pose ratios', () => {
    expect(normalizePoseRatio(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(normalizePoseRatio(0.4, 0.6, 0.2)).toBeCloseTo(0.5);
    expect(normalizePoseRatio(0.2, 0.2, 0.6)).toBe(0);
    expect(normalizePoseRatio(0.6, 0.2, 0.6)).toBe(1);
    expect(normalizePoseRatio(2, 0.2, 0.6)).toBe(1);
    expect(normalizePoseRatio(-2, 0.2, 0.6)).toBe(0);
  });

  it('rejects missing poses and insufficient top-bottom separation', () => {
    expect(validateCalibration(0.3, 0.34).valid).toBe(false);
    expect(validateCalibration(Number.NaN, 0.6).valid).toBe(false);
    expect(normalizePoseRatio(0.3, 0.3, 0.3)).toBeNull();
    expect(normalizePoseRatio(Number.NaN, 0.2, 0.8)).toBeNull();
    expect(validateCalibration(0.2, 0.8).valid).toBe(true);
  });
});
