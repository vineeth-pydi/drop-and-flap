/**
 * Development-test entry only. The production index never imports this module.
 * Synthetic coordinates exercise the real UI and rules, not camera accuracy.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import App from '../../src/App';
import '../../src/styles.css';
import type { PoseFrame, PoseLandmark, PoseSource } from '../../src/pose/types';

export interface FormHarnessControls {
  setPose(elbowAngle: number, hipY?: number, bentKnee?: boolean): void;
  setVisible(visible: boolean): void;
  status(): { activeSources: number; emittedFrames: number };
}

declare global {
  interface Window {
    formHarness: FormHarnessControls;
  }
}

const aspectRatio = 4 / 3;
let pose = { elbowAngle: 170, hipY: 0.35, bentKnee: false, visible: true };
let activeSources = 0;
let emittedFrames = 0;

function syntheticFrame(timestamp: number): PoseFrame {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 0.01, presence: 0.99,
  }));
  const point = (x: number, y: number): PoseLandmark => ({
    x: x / aspectRatio, y, z: 0, visibility: 0.99, presence: 0.99,
  });
  const radians = pose.elbowAngle * Math.PI / 180;
  landmarks[11] = point(0.2, 0.35);
  landmarks[13] = point(0.2, 0.5);
  landmarks[15] = point(0.2 + 0.15 * Math.sin(radians), 0.5 - 0.15 * Math.cos(radians));
  landmarks[23] = point(0.65, pose.hipY);
  landmarks[25] = point(1, 0.35);
  landmarks[27] = point(pose.bentKnee ? 1.1 : 1.3, pose.bentKnee ? 0.2 : 0.35);
  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  return {
    timestamp,
    ratio: nose.y,
    confidence: 0.99,
    shoulderWidth: Math.hypot((leftShoulder.x - rightShoulder.x) * aspectRatio, leftShoulder.y - rightShoulder.y),
    nose: { x: nose.x, y: nose.y },
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y },
    rightShoulder: { x: rightShoulder.x, y: rightShoulder.y },
    landmarks,
    aspectRatio,
    mode: 'form',
  };
}

class SyntheticPoseSource implements PoseSource {
  private timer: number | null = null;
  private running = false;

  async start(video: HTMLVideoElement, onFrame: (frame: PoseFrame | null) => void): Promise<void> {
    this.stop();
    await video.play();
    this.running = true;
    activeSources += 1;
    const emit = () => {
      emittedFrames += 1;
      onFrame(pose.visible ? syntheticFrame(performance.now()) : null);
    };
    emit();
    this.timer = window.setInterval(emit, 50);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.running) activeSources -= 1;
    this.running = false;
  }
}

window.formHarness = {
  setPose(elbowAngle, hipY = 0.35, bentKnee = false) {
    if (!Number.isFinite(elbowAngle) || !Number.isFinite(hipY)) throw new Error('Synthetic pose values must be finite.');
    pose = { ...pose, elbowAngle, hipY, bentKnee };
  },
  setVisible(visible) { pose = { ...pose, visible }; },
  status() { return { activeSources, emittedFrames }; },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App formPoseSourceFactory={() => new SyntheticPoseSource()} /></React.StrictMode>,
);
