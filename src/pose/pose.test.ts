import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCameraStream,
  formPoseFrameFromLandmarks,
  MediaPipePoseSource,
  poseFrameFromLandmarks,
} from './MediaPipePoseSource';
import type { PoseLandmark } from './types';

const mediaPipe = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mediaPipe.forVisionTasks },
  PoseLandmarker: { createFromOptions: mediaPipe.createFromOptions },
}));

type InputLandmark = PoseLandmark & { presence?: number };

/** Synthetic coordinates test controller math, not model accuracy. */
function fixture(): InputLandmark[] {
  const landmarks: InputLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
    presence: 0.99,
  }));
  landmarks[0] = { ...landmarks[0], y: 0.3 };
  landmarks[11] = { ...landmarks[11], x: 0.3, y: 0.5 };
  landmarks[12] = { ...landmarks[12], x: 0.7, y: 0.5 };
  return landmarks;
}

describe('pose frame geometry', () => {
  it('normalizes nose height by aspect-corrected shoulder distance', () => {
    const frame = poseFrameFromLandmarks(fixture(), 123, 4 / 3);
    expect(frame?.shoulderWidth).toBeCloseTo(0.4 * 4 / 3);
    expect(frame?.ratio).toBeCloseTo(0.3 / (0.4 * 4 / 3));
    expect(frame?.timestamp).toBe(123);
    expect(frame?.landmarks).toHaveLength(33);
  });

  it('preserves common vertical movement of the nose and shoulders for calibration', () => {
    const top = fixture();
    const bottom = top.map((landmark) => ({ ...landmark, y: landmark.y + 0.1 }));
    expect(poseFrameFromLandmarks(bottom, 2)?.ratio).toBeGreaterThan(
      poseFrameFromLandmarks(top, 1)!.ratio,
    );
  });

  it('uses the weakest relevant visibility or presence score', () => {
    const landmarks = fixture();
    landmarks[11].presence = 0.7;
    expect(poseFrameFromLandmarks(landmarks, 1)?.confidence).toBe(0.7);
    landmarks[12].visibility = 0.49;
    expect(poseFrameFromLandmarks(landmarks, 2)).toBeNull();
  });

  it('rejects missing, clipped, degenerate, and nonfinite landmark geometry', () => {
    expect(poseFrameFromLandmarks([], 1)).toBeNull();
    const missingConfidence = fixture();
    missingConfidence[0].visibility = undefined;
    expect(poseFrameFromLandmarks(missingConfidence, 1)).toBeNull();
    const clipped = fixture();
    clipped[0].x = -0.1;
    expect(poseFrameFromLandmarks(clipped, 1)).toBeNull();
    const collapsed = fixture();
    collapsed[12] = { ...collapsed[11] };
    expect(poseFrameFromLandmarks(collapsed, 1)).toBeNull();
    const invalid = fixture();
    invalid[0].y = Number.NaN;
    expect(poseFrameFromLandmarks(invalid, 1)).toBeNull();
    expect(poseFrameFromLandmarks(fixture(), 1, 0)).toBeNull();
  });
});

describe('raw form pose frames', () => {
  it('keeps the near side when the far shoulder and nose have low visibility', () => {
    const sideView = fixture();
    sideView[0].visibility = 0.1;
    for (const index of [12, 14, 16, 24, 26, 28]) sideView[index].visibility = 0.05;
    const frame = formPoseFrameFromLandmarks(sideView, 100, 16 / 9);
    expect(frame?.mode).toBe('form');
    expect(frame?.aspectRatio).toBe(16 / 9);
    expect(frame?.landmarks).toEqual(sideView);
    expect(frame?.confidence).toBe(0.99);
    expect(poseFrameFromLandmarks(sideView, 100, 16 / 9)).toBeNull();
  });

  it('retains off-frame coordinates and coincident shoulders without inventing replacements', () => {
    const sideView = fixture();
    sideView[0].x = -0.1;
    sideView[12] = { ...sideView[11] };
    sideView[27].y = 1.1;
    const frame = formPoseFrameFromLandmarks(sideView, 100);
    expect(frame?.nose.x).toBe(-0.1);
    expect(frame?.shoulderWidth).toBe(0);
    expect(frame?.ratio).toBe(sideView[0].y);
    expect(frame?.landmarks[27].y).toBe(1.1);
  });

  it('does not turn weak or missing confidence into a passing signal', () => {
    const uncertain = fixture().map((landmark) => ({ ...landmark, visibility: 0.1 }));
    expect(formPoseFrameFromLandmarks(uncertain, 100)?.confidence).toBe(0.1);
    const missingConfidence = fixture().map(({ x, y }) => ({ x, y }));
    expect(formPoseFrameFromLandmarks(missingConfidence, 100)?.confidence).toBe(0);
  });

  it('rejects incomplete, sparse, nonfinite, or invalid raw data', () => {
    expect(formPoseFrameFromLandmarks([], 100)).toBeNull();
    expect(formPoseFrameFromLandmarks(fixture().slice(0, 32), 100)).toBeNull();
    expect(formPoseFrameFromLandmarks(new Array<InputLandmark>(33), 100)).toBeNull();
    for (const key of ['x', 'y', 'z', 'visibility', 'presence'] as const) {
      const invalid = fixture();
      invalid[15][key] = Number.NaN;
      expect(formPoseFrameFromLandmarks(invalid, 100)).toBeNull();
    }
    expect(formPoseFrameFromLandmarks(fixture(), Number.NaN)).toBeNull();
    expect(formPoseFrameFromLandmarks(fixture(), 100, 0)).toBeNull();
  });
});

class FakeMediaStream {
  readonly track = {
    readyState: 'live',
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };

  getVideoTracks() {
    return [this.track];
  }
}

describe('camera and pose source lifecycle', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let source: MediaPipePoseSource;
  let stream: FakeMediaStream;
  let video: HTMLVideoElement;
  let model: { detectForVideo: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    frames = new Map();
    nextFrame = 1;
    stream = new FakeMediaStream();
    model = {
      detectForVideo: vi.fn().mockReturnValue({ landmarks: [fixture()] }),
      close: vi.fn(),
    };
    mediaPipe.forVisionTasks.mockResolvedValue({});
    mediaPipe.createFromOptions.mockReset().mockResolvedValue(model);
    getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('window', {
      isSecureContext: true,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal('MediaStream', FakeMediaStream);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    video = {
      play: vi.fn().mockResolvedValue(undefined),
      readyState: 2,
      videoWidth: 640,
      videoHeight: 480,
      currentTime: 0,
      srcObject: stream,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    source = new MediaPipePoseSource();
  });

  afterEach(() => {
    source.stop();
    vi.unstubAllGlobals();
  });

  function runFrame(timestamp: number, videoTime: number): void {
    video.currentTime = videoTime;
    const [id, callback] = [...frames.entries()][0];
    frames.delete(id);
    callback(timestamp);
  }

  it('requests video only, using the front camera and modest ideal dimensions', async () => {
    await expect(createCameraStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
  });

  it('provides an actionable permission error', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await expect(createCameraStream()).rejects.toThrow('Camera permission was denied');
  });

  it('uses local assets, falls back from GPU to CPU, and closes inference without taking camera ownership', async () => {
    mediaPipe.createFromOptions.mockRejectedValueOnce(new Error('GPU unavailable'));
    await source.start(video, vi.fn());
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    expect(mediaPipe.forVisionTasks).toHaveBeenCalledWith(`${base}wasm`);
    expect(mediaPipe.createFromOptions.mock.calls.map((call) => call[1].baseOptions.delegate))
      .toEqual(['GPU', 'CPU']);
    expect(mediaPipe.createFromOptions.mock.calls[1][1].baseOptions.modelAssetPath)
      .toBe(`${base}models/pose_landmarker_lite.task`);
    source.stop();
    expect(model.close).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it('skips repeated video frames and emits null for a weak pose', async () => {
    const onFrame = vi.fn();
    await source.start(video, onFrame);
    runFrame(100, 1);
    runFrame(160, 1);
    expect(model.detectForVideo).toHaveBeenCalledTimes(1);
    const weakPose = fixture();
    weakPose[0].visibility = 0.1;
    model.detectForVideo.mockReturnValue({ landmarks: [weakPose] });
    runFrame(220, 2);
    expect(onFrame.mock.calls[0][0]?.timestamp).toBe(100);
    expect(onFrame).toHaveBeenLastCalledWith(null);
    expect(model.detectForVideo.mock.calls[1][1]).toBeGreaterThan(model.detectForVideo.mock.calls[0][1]);
  });

  it('selects the raw form path while still emitting null when no person is found', async () => {
    source = new MediaPipePoseSource({ mode: 'form' });
    const onFrame = vi.fn();
    const sideView = fixture();
    sideView[12].visibility = 0.05;
    model.detectForVideo.mockReturnValue({ landmarks: [sideView] });
    await source.start(video, onFrame);
    runFrame(100, 1);
    expect(onFrame.mock.lastCall?.[0]).toMatchObject({ mode: 'form', aspectRatio: 4 / 3 });
    expect(onFrame.mock.lastCall?.[0].landmarks).toEqual(sideView);
    model.detectForVideo.mockReturnValue({ landmarks: [] });
    runFrame(160, 2);
    expect(onFrame).toHaveBeenLastCalledWith(null);
  });

  it('cancels an unfinished video startup immediately', async () => {
    const pendingVideo = { ...video, play: vi.fn().mockReturnValue(new Promise(() => {})) } as unknown as HTMLVideoElement;
    const startup = source.start(pendingVideo, vi.fn());
    source.stop();
    await expect(startup).rejects.toMatchObject({ name: 'AbortError' });
    expect(mediaPipe.createFromOptions).not.toHaveBeenCalled();
  });

  it('recovers three consecutive GPU inference errors with CPU inference', async () => {
    const onFrame = vi.fn();
    await source.start(video, onFrame);
    const cpuModel = {
      detectForVideo: vi.fn().mockReturnValue({ landmarks: [fixture()] }),
      close: vi.fn(),
    };
    mediaPipe.createFromOptions.mockResolvedValueOnce(cpuModel);
    model.detectForVideo.mockImplementation(() => { throw new Error('lost GPU'); });
    runFrame(100, 1);
    runFrame(160, 2);
    runFrame(220, 3);
    await vi.waitFor(() => expect(mediaPipe.createFromOptions).toHaveBeenCalledTimes(2));
    expect(mediaPipe.createFromOptions.mock.calls[1][1].baseOptions.delegate).toBe('CPU');
    expect(model.close).toHaveBeenCalledOnce();
    runFrame(280, 4);
    expect(cpuModel.detectForVideo).toHaveBeenCalledOnce();
    expect(onFrame.mock.lastCall?.[0]).not.toBeNull();
  });

  it('reports consecutive CPU inference errors and stops scheduling work', async () => {
    const onError = vi.fn();
    source = new MediaPipePoseSource({ onError });
    mediaPipe.createFromOptions.mockRejectedValueOnce(new Error('no GPU'));
    await source.start(video, vi.fn());
    model.detectForVideo.mockImplementation(() => { throw new Error('inference unavailable'); });
    runFrame(100, 1);
    runFrame(160, 2);
    runFrame(220, 3);
    expect(onError).toHaveBeenCalledOnce();
    expect(source.lastError?.message).toContain('Pose tracking stopped');
    expect(frames.size).toBe(0);
  });

  it('closes a model that finishes loading after its startup was cancelled', async () => {
    let finishModel!: (value: typeof model) => void;
    mediaPipe.createFromOptions.mockReturnValue(new Promise((resolve) => { finishModel = resolve; }));
    const startup = source.start(video, vi.fn());
    await vi.waitFor(() => expect(mediaPipe.createFromOptions).toHaveBeenCalled());
    source.stop();
    finishModel(model);
    await expect(startup).rejects.toMatchObject({ name: 'AbortError' });
    expect(model.close).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it('stops and reports an ended camera instead of keeping an old pose', async () => {
    const onError = vi.fn();
    source = new MediaPipePoseSource({ onError });
    const onFrame = vi.fn();
    await source.start(video, onFrame);
    stream.track.readyState = 'ended';
    runFrame(100, 1);
    expect(onFrame).toHaveBeenLastCalledWith(null);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('camera stopped') }));
    expect(model.close).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
