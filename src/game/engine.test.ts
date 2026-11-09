import { describe, expect, it } from 'vitest';
import {
  BIRD_RADIUS, CAMERA_BOTTOM_Y, CAMERA_TOP_Y, DIFFICULTY_CONFIG, GROUND_Y, PIPE_WIDTH,
  createGame, flap, pauseGame, resumeGame, startGame, updateGame,
} from './engine';

describe('game engine', () => {
  it('creates deterministic, ready games with progressively harder settings', () => {
    const easy = createGame('easy', () => 0.5);
    expect(easy.status).toBe('ready');
    expect(easy.pipes[0].gapY).toBe(304);
    expect(easy.pipes.map((pipe) => pipe.id)).toEqual([1, 2, 3]);
    expect(DIFFICULTY_CONFIG.easy.gapSize).toBeGreaterThan(DIFFICULTY_CONFIG.hard.gapSize);
    expect(DIFFICULTY_CONFIG.easy.speed).toBeLessThan(DIFFICULTY_CONFIG.hard.speed);
  });

  it('freezes ready, paused and crashed games', () => {
    const state = createGame('normal');
    updateGame(state, 0.1);
    expect(state.elapsed).toBe(0);
    startGame(state);
    pauseGame(state);
    updateGame(state, 0.1, 1);
    expect(state.bird.y).toBe(304);
    resumeGame(state);
    updateGame(state, 0.1, 0.5);
    expect(state.elapsed).toBeCloseTo(0.1);
    state.status = 'crashed';
    updateGame(state, 0.1, 1);
    expect(state.elapsed).toBeCloseTo(0.1);
    expect(startGame(state).status).toBe('crashed');
  });

  it('applies gravity and a manual flap impulse', () => {
    const state = startGame(createGame('easy'));
    updateGame(state, 0.1);
    expect(state.bird.y).toBeCloseTo(308.5);
    expect(state.bird.vy).toBeCloseTo(90);
    flap(state);
    const before = state.bird.y;
    updateGame(state, 0.1);
    expect(state.bird.y).toBeLessThan(before);
  });

  it('maps and clamps camera input without immediately snapping the bird', () => {
    const state = startGame(createGame('easy'));
    updateGame(state, 0.02, -1);
    expect(state.bird.y).toBeGreaterThan(CAMERA_TOP_Y);
    expect(state.bird.y).toBeLessThan(304);
    for (let index = 0; index < 35; index += 1) updateGame(state, 0.02, -1);
    expect(state.bird.y).toBeCloseTo(CAMERA_TOP_Y, 1);
    for (let index = 0; index < 40; index += 1) updateGame(state, 0.02, 2);
    expect(state.bird.y).toBeCloseTo(CAMERA_BOTTOM_Y, 1);
    expect(state.status).toBe('playing');
  });

  it('has frame-rate independent camera smoothing', () => {
    const a = startGame(createGame('easy', () => 0.5));
    const b = startGame(createGame('easy', () => 0.5));
    for (let index = 0; index < 10; index += 1) updateGame(a, 0.01, 0);
    updateGame(b, 0.1, 0);
    expect(a.bird.y).toBeCloseTo(b.bird.y, 8);
    expect(a.pipes[0].x).toBeCloseTo(b.pipes[0].x, 8);
  });

  it('ignores invalid deltas and clamps a backgrounded frame', () => {
    const state = startGame(createGame('easy'));
    updateGame(state, Number.NaN, 0.5);
    updateGame(state, -2, 0.5);
    updateGame(state, Number.POSITIVE_INFINITY, 0.5);
    expect(state.elapsed).toBe(0);
    updateGame(state, 60, 0.5);
    expect(state.elapsed).toBeCloseTo(0.1);
    expect(state.pipes[0].x).toBeCloseTo(574);
  });

  it('scores each fully crossed pipe only once', () => {
    const state = startGame(createGame('easy', () => 0.5));
    state.pipes[0].x = state.bird.x - BIRD_RADIUS - PIPE_WIDTH + 1;
    updateGame(state, 0.1, 0.5);
    expect(state.score).toBe(1);
    updateGame(state, 0.1, 0.5);
    expect(state.score).toBe(1);
  });

  it('detects upper and lower pipe collisions', () => {
    for (const y of [100, 500]) {
      const state = startGame(createGame('normal', () => 0.5));
      state.pipes[0].x = state.bird.x;
      state.bird.y = y;
      updateGame(state, 0.01);
      expect(state.status).toBe('crashed');
      expect(state.score).toBe(0);
    }
  });

  it('allows a safe gap passage and applies actual circle geometry at pipe corners', () => {
    const state = startGame(createGame('normal', () => 0.5));
    state.pipes[0].x = state.bird.x + 12;
    state.bird.y = state.pipes[0].gapY - state.pipes[0].gapSize / 2 + 12;
    updateGame(state, 0.001);
    expect(state.status).toBe('playing');
    state.bird.y = 304;
    state.bird.vy = 0;
    state.pipes[0].x = 100;
    updateGame(state, 0.01, 0.5);
    expect(state.status).toBe('playing');
  });

  it('crashes at the ceiling and ground without allowing later movement', () => {
    for (const y of [BIRD_RADIUS - 1, GROUND_Y - BIRD_RADIUS + 1]) {
      const state = startGame(createGame('easy'));
      state.bird.y = y;
      updateGame(state, 0.01);
      expect(state.status).toBe('crashed');
      const crashedY = state.bird.y;
      flap(state);
      updateGame(state, 0.1);
      expect(state.bird.y).toBe(crashedY);
    }
  });

  it('removes old pipes and keeps generating reachable gradual gaps', () => {
    const state = startGame(createGame('easy', () => 0.5));
    state.pipes = [{ ...state.pipes[0], x: -100, scored: true }];
    updateGame(state, 0.005, 0.5);
    expect(state.pipes.length).toBe(1);
    expect(state.pipes[0].id).toBe(4);
    expect(state.pipes[0].x).toBe(580);
    for (const pipe of createGame('hard', () => 0.5).pipes) {
      expect(pipe.gapY - pipe.gapSize / 2).toBeGreaterThan(0);
      expect(pipe.gapY + pipe.gapSize / 2).toBeLessThan(GROUND_Y);
    }
  });
});
