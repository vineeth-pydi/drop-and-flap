# Third-party notices

## MediaPipe Pose Landmarker Lite and Tasks Vision

Copyright Google LLC and the MediaPipe contributors. The Pose Landmarker Lite
model and MediaPipe runtime are licensed under the Apache License, Version 2.0.

- [Official model download](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task)
- [Official Pose Landmarker documentation and model links](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
- [BlazePose GHUM model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf), page 2, identifies the model license as Apache License, Version 2.0.
- [MediaPipe source license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)

`npm run assets` places the full license at
`public/licenses/mediapipe-LICENSE.txt`, copies the installed package's WASM
runtime's SIMD and non-SIMD fallback pairs, and records the exact package
version, byte sizes, and file SHA256 values in `public/model-assets.json`.
The unused ES module runtime pair is omitted because the app uses
`FilesetResolver.forVisionTasks` with its default `useModule=false`.
The original model and copied WASM files are unmodified.

The app uses local pose inference for entertainment. The model card describes
sensitivity to position, scale, orientation, lighting, and occlusion. This
project has not established camera accuracy or inference speed across devices.

## Self-hosted fonts

Press Start 2P: Copyright 2012 The Press Start 2P Project Authors (cody@zone38.net), Reserved Font Name "Press Start 2P".
VT323: Copyright 2011 The VT323 Project Authors (peter.hull@oikoi.com).
Both are distributed unmodified under SIL Open Font License 1.1. Full licenses are included in public/licenses/press-start-2p-OFL.txt and public/licenses/vt323-OFL.txt.
