import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseFrame, PoseLandmark, PoseMode, PoseSource } from './types';

const MIN_LANDMARK_CONFIDENCE = 0.5;
const MIN_SHOULDER_WIDTH = 0.04;
const DEFAULT_FRAME_INTERVAL_MS = 50;
const VIDEO_READY_TIMEOUT_MS = 10_000;

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type Delegate = 'GPU' | 'CPU';
type DetectedLandmark = PoseLandmark & { presence?: number };

export interface MediaPipePoseSourceOptions {
  /** A fatal runtime failure needs a visible retry or keyboard fallback in the UI. */
  onError?: (error: Error) => void;
  /** Form emits raw full-pose coordinates; its assessment owns all readiness gates. */
  mode?: PoseMode;
}

/** Resolve public assets correctly for both '/' and a hosted subdirectory. */
function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

function abortError(): Error {
  const error = new Error('Pose tracking was stopped.');
  error.name = 'AbortError';
  return error;
}

function closeLandmarker(landmarker: PoseLandmarker | null): void {
  try {
    landmarker?.close();
  } catch {
    // A lost GPU context can already be unusable. Cleanup must still cancel
    // tracking and let the caller release its camera stream.
  }
}

function landmarkConfidence(landmark: DetectedLandmark): number {
  // Missing confidence is not evidence of a visible, reliable landmark.
  const visibility = landmark.visibility ?? 0;
  const presence = landmark.presence ?? visibility;
  return Math.min(visibility, presence);
}

function isInsideFrame(landmark: PoseLandmark): boolean {
  return (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    landmark.x >= 0 &&
    landmark.x <= 1 &&
    landmark.y >= 0 &&
    landmark.y <= 1
  );
}

/** Pure conversion used by the tracker and deterministic geometry checks. */
export function poseFrameFromLandmarks(
  landmarks: readonly DetectedLandmark[],
  timestamp: number,
  aspectRatio = 4 / 3,
): PoseFrame | null {
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  if (!nose || !leftShoulder || !rightShoulder) return null;
  if (![nose, leftShoulder, rightShoulder].every(isInsideFrame)) return null;
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;

  const confidence = Math.min(
    landmarkConfidence(nose),
    landmarkConfidence(leftShoulder),
    landmarkConfidence(rightShoulder),
  );
  if (!Number.isFinite(confidence) || confidence < MIN_LANDMARK_CONFIDENCE) {
    return null;
  }

  // x is normalized by image width; y by image height. Bring both into the
  // same units before computing a geometric distance.
  const shoulderWidth = Math.hypot(
    (leftShoulder.x - rightShoulder.x) * aspectRatio,
    leftShoulder.y - rightShoulder.y,
  );
  if (shoulderWidth < MIN_SHOULDER_WIDTH) return null;

  // Subtracting shoulder height would cancel motion when the nose and torso
  // move together. Absolute nose height preserves that motion for a fixed
  // camera; each session calibrates its own top and bottom values.
  const ratio = nose.y / shoulderWidth;
  if (!Number.isFinite(ratio)) return null;

  return {
    timestamp,
    ratio,
    confidence,
    shoulderWidth,
    nose: { x: nose.x, y: nose.y },
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y },
    rightShoulder: { x: rightShoulder.x, y: rightShoulder.y },
    landmarks: landmarks.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })),
    aspectRatio,
    mode: 'arcade',
  };
}

/**
 * Preserve the model's complete pose for side-view geometry. Low visibility,
 * off-frame points, and overlapping shoulders are retained, not graded here.
 * The form assessment must gate the relevant side and whole-body visibility
 * before deriving angles, alignment, or rep decisions from these coordinates.
 */
export function formPoseFrameFromLandmarks(
  landmarks: readonly DetectedLandmark[],
  timestamp: number,
  aspectRatio = 4 / 3,
): PoseFrame | null {
  if (landmarks.length !== 33 || !Number.isFinite(timestamp) || timestamp < 0
    || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  for (let index = 0; index < 33; index += 1) {
    const landmark = landmarks[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)
      || (landmark.z !== undefined && !Number.isFinite(landmark.z))
      || (landmark.visibility !== undefined && (!Number.isFinite(landmark.visibility)
        || landmark.visibility < 0 || landmark.visibility > 1))
      || (landmark.presence !== undefined && (!Number.isFinite(landmark.presence)
        || landmark.presence < 0 || landmark.presence > 1))) return null;
  }

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const shoulderWidth = Math.hypot(
    (leftShoulder.x - rightShoulder.x) * aspectRatio,
    leftShoulder.y - rightShoulder.y,
  );
  if (!Number.isFinite(shoulderWidth)) return null;
  const sideConfidence = (indices: number[]) => Math.min(
    ...indices.map((index) => landmarkConfidence(landmarks[index])),
  );
  const confidence = Math.max(
    sideConfidence([11, 13, 15, 23, 25, 27]),
    sideConfidence([12, 14, 16, 24, 26, 28]),
  );

  return {
    timestamp,
    // Mandatory legacy field: preserve a real model measurement. Form code
    // uses landmarks, not the arcade's nose/shoulder controller ratio.
    ratio: nose.y,
    confidence,
    shoulderWidth,
    nose: { x: nose.x, y: nose.y },
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y },
    rightShoulder: { x: rightShoulder.x, y: rightShoulder.y },
    landmarks: landmarks.map(({ x, y, z, visibility, presence }) => ({ x, y, z, visibility, presence })),
    aspectRatio,
    mode: 'form',
  };
}

/** Camera access is requested only when the caller invokes this function. */
export async function createCameraStream(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error('Camera access needs HTTPS or localhost. Open the game at a secure address.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access. Use keyboard mode or a supported browser.');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const messages: Record<string, string> = {
      NotAllowedError: 'Camera permission was denied. Allow the camera in browser settings, or use keyboard mode.',
      PermissionDeniedError: 'Camera permission was denied. Allow the camera in browser settings, or use keyboard mode.',
      NotFoundError: 'No camera was found. Connect a camera, or use keyboard mode.',
      DevicesNotFoundError: 'No camera was found. Connect a camera, or use keyboard mode.',
      NotReadableError: 'The camera is busy or unavailable. Close other camera apps and retry, or use keyboard mode.',
      TrackStartError: 'The camera is busy or unavailable. Close other camera apps and retry, or use keyboard mode.',
      OverconstrainedError: 'The camera could not provide a usable video stream. Try another camera or keyboard mode.',
      SecurityError: 'Browser security settings blocked the camera. Use HTTPS or localhost, or switch to keyboard mode.',
      AbortError: 'The camera could not start. Retry camera access, or use keyboard mode.',
    };
    throw new Error(messages[name] ?? 'The camera could not start. Check camera access and retry, or use keyboard mode.');
  }
}

/**
 * MediaPipe runs locally against the attached video. No images are encoded,
 * uploaded, recorded, or saved. Only current landmark coordinates are emitted.
 */
export class MediaPipePoseSource implements PoseSource {
  private landmarker: PoseLandmarker | null = null;
  private fileset: VisionFileset | null = null;
  private video: HTMLVideoElement | null = null;
  private onFrame: ((frame: PoseFrame | null) => void) | null = null;
  private readonly onError?: (error: Error) => void;
  private readonly mode: PoseMode;
  private animationFrame: number | null = null;
  private startupAbort: AbortController | null = null;
  private session = 0;
  private lastDetectionAt = -Infinity;
  private lastVideoTime = -1;
  private lastVideoAdvanceAt = 0;
  private lastTimestamp = -1;
  private frameIntervalMs = DEFAULT_FRAME_INTERVAL_MS;
  private processingDuration = 0;
  private framesSinceAdaptation = 0;
  private resolutionLevel = 0;
  private adaptationPending = false;
  private consecutiveErrors = 0;
  private recovering = false;
  private activeDelegate: Delegate = 'GPU';
  private runtimeError: Error | null = null;

  constructor(options: MediaPipePoseSourceOptions = {}) {
    this.onError = options.onError;
    this.mode = options.mode ?? 'arcade';
  }

  get lastError(): Error | null {
    return this.runtimeError;
  }

  async start(
    video: HTMLVideoElement,
    onFrame: (frame: PoseFrame | null) => void,
  ): Promise<void> {
    this.stop();
    const session = this.session;
    const startupAbort = new AbortController();
    this.startupAbort = startupAbort;
    this.runtimeError = null;
    this.resetTiming();
    let phase: 'camera' | 'model' = 'camera';

    try {
      await this.prepareVideo(video, session, startupAbort.signal);
      this.assertCurrentSession(session);
      phase = 'model';
      const fileset = await FilesetResolver.forVisionTasks(publicAsset('wasm'));
      this.assertCurrentSession(session);

      let landmarker: PoseLandmarker;
      let delegate: Delegate = 'GPU';
      try {
        landmarker = await this.createLandmarker(fileset, 'GPU');
      } catch {
        this.assertCurrentSession(session);
        delegate = 'CPU';
        landmarker = await this.createLandmarker(fileset, 'CPU');
      }
      if (session !== this.session) {
        closeLandmarker(landmarker);
        throw abortError();
      }

      this.fileset = fileset;
      this.landmarker = landmarker;
      this.activeDelegate = delegate;
      this.video = video;
      this.onFrame = onFrame;
      this.startupAbort = null;
      this.lastVideoAdvanceAt = performance.now();
      this.scheduleFrame(session);
    } catch (error) {
      if (session !== this.session || (error instanceof Error && error.name === 'AbortError')) {
        throw abortError();
      }
      const readableError = new Error(
        phase === 'camera'
          ? 'The camera did not provide playable video. Retry camera access, or use keyboard mode.'
          : 'Pose tracking could not start. Check that the local model and WASM assets loaded, then retry or use keyboard mode.',
        { cause: error },
      );
      this.startupAbort = null;
      this.runtimeError = readableError;
      throw readableError;
    }
  }

  stop(): void {
    this.session += 1;
    this.startupAbort?.abort();
    this.startupAbort = null;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    closeLandmarker(this.landmarker);
    this.landmarker = null;
    this.fileset = null;
    this.video = null;
    this.onFrame = null;
    this.recovering = false;
    this.adaptationPending = false;
    // Stream ownership stays with the UI so switching modes can stop every track.
  }

  private assertCurrentSession(session: number): void {
    if (session !== this.session) throw abortError();
  }

  private resetTiming(): void {
    this.lastDetectionAt = -Infinity;
    this.lastVideoTime = -1;
    this.lastTimestamp = -1;
    this.frameIntervalMs = DEFAULT_FRAME_INTERVAL_MS;
    this.processingDuration = 0;
    this.framesSinceAdaptation = 0;
    this.resolutionLevel = 0;
    this.consecutiveErrors = 0;
  }

  private async prepareVideo(
    video: HTMLVideoElement,
    session: number,
    signal: AbortSignal,
  ): Promise<void> {
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      void video.play().then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });
    this.assertCurrentSession(session);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) return;

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const checkReady = () => {
        if (session !== this.session) {
          cleanup();
          reject(abortError());
        } else if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          cleanup();
          resolve();
        }
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('The camera did not provide a video frame.'));
      }, VIDEO_READY_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadeddata', checkReady);
        video.removeEventListener('canplay', checkReady);
      };
      video.addEventListener('loadeddata', checkReady);
      video.addEventListener('canplay', checkReady);
      signal.addEventListener('abort', onAbort, { once: true });
      checkReady();
    });
  }

  private createLandmarker(fileset: VisionFileset, delegate: Delegate): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: publicAsset('models/pose_landmarker_lite.task'),
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputSegmentationMasks: false,
    });
  }

  private scheduleFrame(session: number): void {
    if (session !== this.session) return;
    this.animationFrame = requestAnimationFrame((now) => this.processFrame(now, session));
  }

  private processFrame(now: number, session: number): void {
    if (session !== this.session) return;
    this.animationFrame = null;
    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker || this.recovering) {
      this.scheduleFrame(session);
      return;
    }
    if (now - this.lastDetectionAt < this.frameIntervalMs) {
      this.scheduleFrame(session);
      return;
    }
    this.lastDetectionAt = now;

    const stream = video.srcObject;
    if (stream instanceof MediaStream && !stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      this.fail(new Error('The camera stopped. Reconnect it and retry, or use keyboard mode.'));
      return;
    }
    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.currentTime === this.lastVideoTime
    ) {
      // A stalled camera must not leave an old pose available to the rep counter.
      if (now - this.lastVideoAdvanceAt >= 500) this.onFrame?.(null);
      this.scheduleFrame(session);
      return;
    }
    this.lastVideoTime = video.currentTime;
    this.lastVideoAdvanceAt = now;
    const timestamp = Math.max(now, this.lastTimestamp + 0.001);
    this.lastTimestamp = timestamp;

    try {
      const startedAt = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);
      const elapsed = performance.now() - startedAt;
      this.consecutiveErrors = 0;
      const landmarks = result.landmarks[0];
      const toFrame = this.mode === 'form' ? formPoseFrameFromLandmarks : poseFrameFromLandmarks;
      this.onFrame?.(
        landmarks
          ? toFrame(landmarks, timestamp, video.videoWidth / video.videoHeight)
          : null,
      );
      this.adaptToProcessingTime(elapsed, session);
    } catch {
      this.onFrame?.(null);
      this.consecutiveErrors += 1;
      if (this.consecutiveErrors >= 3) {
        if (this.activeDelegate === 'GPU') {
          void this.recoverWithCPU(session);
        } else {
          this.fail(new Error('Pose tracking stopped. Retry camera mode, or use keyboard mode.'));
          return;
        }
      }
    }
    this.scheduleFrame(session);
  }

  private async recoverWithCPU(session: number): Promise<void> {
    const fileset = this.fileset;
    if (!fileset || this.recovering || session !== this.session) return;
    this.recovering = true;
    closeLandmarker(this.landmarker);
    this.landmarker = null;
    try {
      const landmarker = await this.createLandmarker(fileset, 'CPU');
      if (session !== this.session) {
        closeLandmarker(landmarker);
        return;
      }
      this.landmarker = landmarker;
      this.activeDelegate = 'CPU';
      this.consecutiveErrors = 0;
      this.lastVideoTime = -1;
    } catch {
      if (session === this.session) {
        this.fail(new Error('Pose tracking could not recover. Retry camera mode, or use keyboard mode.'));
      }
    } finally {
      if (session === this.session) this.recovering = false;
    }
  }

  private adaptToProcessingTime(elapsed: number, session: number): void {
    this.processingDuration = this.processingDuration === 0
      ? elapsed
      : this.processingDuration * 0.9 + elapsed * 0.1;
    this.framesSinceAdaptation += 1;
    this.frameIntervalMs = Math.max(
      DEFAULT_FRAME_INTERVAL_MS,
      Math.min(100, this.processingDuration * 1.4),
    );
    if (
      this.framesSinceAdaptation < 40 ||
      this.processingDuration < 35 ||
      this.resolutionLevel >= 2 ||
      this.adaptationPending
    ) return;

    const stream = this.video?.srcObject;
    if (!(stream instanceof MediaStream)) return;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return;
    this.framesSinceAdaptation = 0;
    this.resolutionLevel += 1;
    this.adaptationPending = true;
    const [width, height] = this.resolutionLevel === 1 ? [480, 360] : [320, 240];
    void track.applyConstraints({
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: 20, max: 24 },
    }).catch(() => {
      // Some cameras cannot change resolution midstream. The inference throttle
      // still applies; failure to adjust an optional constraint is not a fault.
    }).finally(() => {
      if (session === this.session) this.adaptationPending = false;
    });
  }

  private fail(error: Error): void {
    this.onFrame?.(null);
    this.runtimeError = error;
    this.stop();
    this.onError?.(error);
  }
}
