export interface PosePoint {
  x: number;
  y: number;
}

export interface PoseLandmark extends PosePoint {
  z?: number;
  visibility?: number;
  presence?: number;
}

export type PoseMode = 'arcade' | 'form';

export interface PoseFrame {
  /** Monotonically increasing browser timestamp, in milliseconds. */
  timestamp: number;
  /** Arcade: nose height in shoulder units. Form: raw nose y; unused for grading. */
  ratio: number;
  /** Tracking signal summary only; never a form grade or whole-body readiness guarantee. */
  confidence: number;
  /** Shoulder distance in image-height units, corrected for video aspect ratio. */
  shoulderWidth: number;
  nose: PosePoint;
  leftShoulder: PosePoint;
  rightShoulder: PosePoint;
  landmarks: PoseLandmark[];
  /** Native video width divided by height, for aspect-corrected form geometry. */
  aspectRatio?: number;
  mode?: PoseMode;
}

export interface PoseSource {
  start(
    video: HTMLVideoElement,
    onFrame: (frame: PoseFrame | null) => void,
  ): Promise<void>;
  /** Stop inference. The camera stream remains owned by the caller. */
  stop(): void;
}
