/** Fixed logical coordinates keep gameplay identical on desktop and phone. */
export const WORLD_WIDTH = 480;
export const WORLD_HEIGHT = 640;
export const GROUND_Y = 608;
export const BIRD_RADIUS = 13;
export const PIPE_WIDTH = 72;
export const CAMERA_TOP_Y = 95;
export const CAMERA_BOTTOM_Y = 510;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameMode = 'camera' | 'practice';
export type GameStatus = 'ready' | 'playing' | 'paused' | 'crashed';

export interface Bird {
  x: number;
  y: number;
  vy: number;
}

export interface Pipe {
  id: number;
  x: number;
  gapY: number;
  gapSize: number;
  scored: boolean;
}

export interface DifficultyConfig {
  speed: number;
  gapSize: number;
  spacing: number;
  gravity: number;
  flapVelocity: number;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { speed: 60, gapSize: 286, spacing: 330, gravity: 900, flapVelocity: -320 },
  normal: { speed: 76, gapSize: 260, spacing: 306, gravity: 980, flapVelocity: -335 },
  hard: { speed: 94, gapSize: 230, spacing: 288, gravity: 1060, flapVelocity: -350 },
};

export interface GameState {
  difficulty: Difficulty;
  bird: Bird;
  pipes: Pipe[];
  score: number;
  elapsed: number;
  status: GameStatus;
  /** Internal generation state; retained here so each run is self-contained. */
  nextPipeId: number;
  random: () => number;
}

const MAX_FRAME_SECONDS = 0.1;
const MAX_STEP_SECONDS = 1 / 120;
const CAMERA_EASING = 14;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function makePipe(state: GameState, x: number): Pipe {
  const id = state.nextPipeId++;
  const randomSample = state.random();
  const jitter = Number.isFinite(randomSample) ? (clamp(randomSample, 0, 1) - 0.5) * 12 : 0;
  // An eight-pipe wave gradually moves from high to low. Abrupt random jumps
  // are difficult to reach while doing a slow push-up.
  const gapY = 304 + Math.sin((id - 1) * Math.PI / 4) * 130 + jitter;
  return { id, x, gapY, gapSize: DIFFICULTY_CONFIG[state.difficulty].gapSize, scored: false };
}

export function createGame(difficulty: Difficulty = 'easy', random: () => number = Math.random): GameState {
  const state: GameState = {
    difficulty,
    bird: { x: 120, y: 304, vy: 0 },
    pipes: [],
    score: 0,
    elapsed: 0,
    status: 'ready',
    nextPipeId: 1,
    random,
  };
  const spacing = DIFFICULTY_CONFIG[difficulty].spacing;
  for (let index = 0; index < 3; index += 1) {
    state.pipes.push(makePipe(state, WORLD_WIDTH + 100 + index * spacing));
  }
  return state;
}

export function startGame(state: GameState): GameState {
  if (state.status === 'ready') state.status = 'playing';
  return state;
}

export function pauseGame(state: GameState): GameState {
  if (state.status === 'playing') state.status = 'paused';
  return state;
}

export function resumeGame(state: GameState): GameState {
  if (state.status === 'paused') state.status = 'playing';
  return state;
}

export function flap(state: GameState): GameState {
  if (state.status === 'playing') state.bird.vy = DIFFICULTY_CONFIG[state.difficulty].flapVelocity;
  return state;
}

function circleHitsRectangle(bird: Bird, left: number, top: number, right: number, bottom: number): boolean {
  const nearestX = clamp(bird.x, left, right);
  const nearestY = clamp(bird.y, top, bottom);
  const dx = bird.x - nearestX;
  const dy = bird.y - nearestY;
  return dx * dx + dy * dy <= BIRD_RADIUS * BIRD_RADIUS;
}

function hasCollision(state: GameState): boolean {
  const { bird } = state;
  if (bird.y - BIRD_RADIUS <= 0 || bird.y + BIRD_RADIUS >= GROUND_Y) return true;
  return state.pipes.some((pipe) => {
    if (pipe.x > bird.x + BIRD_RADIUS || pipe.x + PIPE_WIDTH < bird.x - BIRD_RADIUS) return false;
    const upperEnd = pipe.gapY - pipe.gapSize / 2;
    const lowerStart = pipe.gapY + pipe.gapSize / 2;
    return circleHitsRectangle(bird, pipe.x, 0, pipe.x + PIPE_WIDTH, upperEnd)
      || circleHitsRectangle(bird, pipe.x, lowerStart, pipe.x + PIPE_WIDTH, GROUND_Y);
  });
}

/**
 * Advances only a playing game, mutating and returning its state.
 * Camera progress is 0 at the top of a push-up and 1 at the bottom.
 * Omitting progress applies gravity, with flap() supplying manual lift.
 */
export function updateGame(state: GameState, dt: number, input?: number): GameState {
  if (state.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return state;
  const seconds = Math.min(dt, MAX_FRAME_SECONDS);
  const config = DIFFICULTY_CONFIG[state.difficulty];
  const cameraTarget = input !== undefined && Number.isFinite(input)
    ? CAMERA_TOP_Y + clamp(input, 0, 1) * (CAMERA_BOTTOM_Y - CAMERA_TOP_Y)
    : undefined;
  let remaining = seconds;

  // Substeps preserve collisions even after a slow or backgrounded frame.
  while (remaining > 0.000001 && state.status === 'playing') {
    const step = Math.min(remaining, MAX_STEP_SECONDS);
    const oldY = state.bird.y;
    if (cameraTarget !== undefined) {
      state.bird.y += (cameraTarget - state.bird.y) * (1 - Math.exp(-CAMERA_EASING * step));
      state.bird.vy = (state.bird.y - oldY) / step;
    } else {
      state.bird.y += state.bird.vy * step + config.gravity * step * step / 2;
      state.bird.vy += config.gravity * step;
    }
    for (const pipe of state.pipes) pipe.x -= config.speed * step;
    state.elapsed += step;

    if (hasCollision(state)) {
      state.status = 'crashed';
      break;
    }

    for (const pipe of state.pipes) {
      if (!pipe.scored && pipe.x + PIPE_WIDTH < state.bird.x - BIRD_RADIUS) {
        pipe.scored = true;
        state.score += 1;
      }
    }
    state.pipes = state.pipes.filter((pipe) => pipe.x + PIPE_WIDTH >= -BIRD_RADIUS);
    const lastPipe = state.pipes[state.pipes.length - 1];
    if (!lastPipe) {
      state.pipes.push(makePipe(state, WORLD_WIDTH + 100));
    } else if (lastPipe.x <= WORLD_WIDTH + config.spacing) {
      state.pipes.push(makePipe(state, lastPipe.x + config.spacing));
    }
    remaining -= step;
  }
  return state;
}
