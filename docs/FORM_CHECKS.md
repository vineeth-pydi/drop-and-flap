# Experimental form checks

Form mode estimates visible side-view joint geometry. It counts movements that meet the rules below, and does not certify correct or safe technique.

Start the camera, then tap **Start form set** before moving away from the phone. An **8-second preparation countdown** runs regardless of whether a body is detected. Afterward, the set runs and checks posture. Missing or unsuitable posture cannot count a rep; the app waits for a usable extended-arm position and a complete movement. Tracking loss clears an unfinished movement but does not require another tap: return to the top and continue. Manual **Pause** stops the set; **Resume form set** uses the same preparation countdown. Leaving the browser tab pauses the set. These setup changes do not relax any geometry or counting thresholds.

| Check | Current engineering rule |
| --- | --- |
| Visible landmarks | Near-side shoulder, elbow, wrist, hip, and knee need visibility/presence at least 0.6; Standard also requires ankle |
| Usable side view | Body roughly horizontal within 35 degrees; sufficiently visible shoulder span vetoes front-facing views |
| Elbow extension | Reach at least 160 degrees at the top |
| Elbow bend | Reach 100 degrees or below at the bottom |
| Body line | Shoulder–hip–knee angle at least 165 degrees; signed deviation distinguishes raised and low hips |
| Standard knee position | Hip–knee–ankle angle at least 155 degrees; Knees mode does not require an ankle |
| Support geometry | Reject a wrist substantially above the shoulder; this does not prove floor contact |
| Complete rep | Extended → bent → extended, at least 650 ms total with controlled descent/ascent; sustained alignment faults reject the full attempt |
| Uncertainty | Missing or stale joints, camera changes, pauses, and side switches clear the unfinished cycle |

The UI shows estimated elbow angle, body-line cue, reps meeting checks, and completed attempts not meeting checks. Partial or hidden movements are not counted. Standard and Knees are explicit user selections. Arm/torso points do not establish chest-to-floor depth, weight bearing, force, pain, all spine curvature, or elbow flare from other directions.

Tests use constructed joint coordinates and a synthetic browser video stream. They verify the geometry, counting state machine, camera lifecycle, and screen behavior. They do not establish accuracy on real people. Real-phone and human-video validation are still required before making accuracy claims.

General movement concepts: [NASM pushup description](https://www.nasm.org/resource-center/exercise-library/push-up). Estimated landmarks: [Google Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker). The numeric rules above are this app's experimental settings, not externally validated cutoffs.
