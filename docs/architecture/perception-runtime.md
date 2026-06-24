# Perception Runtime Architecture

Adaptive Surface's browser/WebView perception implementation is a bounded
research slice for gaze plus deliberate hand gestures. It preserves the product
rule that gaze nominates a semantic target and another intentional modality
confirms action timing.

## Camera Ownership

`src/perception/camera/SharedWebcamSource.ts` is the only runtime module that
calls `navigator.mediaDevices.getUserMedia()`. It opens one `{ audio: false,
video: ... }` stream with 1280x720 and 30 fps ideals, owns the hidden video
element, and hands out reference-counted leases.

Consumers are identified by stable IDs such as `webgazer` and `hand-tracking`.
Concurrent startup shares one startup promise. Releasing a lease is idempotent.
The final release stops every media track exactly once and clears the video
source. Track `ended` events move the shared snapshot into an ended state.

`FramePump` exposes monotonic frame envelopes containing sequence, `performance`
time, dimensions, and `mirrored: false`. Raw frames are not placed in React
state.

## Gaze Branch

`WebGazerProvider` now acquires a shared camera lease before calling
`webgazer.begin()`. It passes the already-open stream through
`webgazer.setStaticVideo(stream)`, fails as unsupported if that hook is missing,
and does not call `webgazer.stopVideo()` during cleanup.

WebGazer's implicit mouse/click listeners are removed after initialization.
Only explicit calibration training samples call `recordScreenPosition`.
Application-level smoothing is the active smoothing layer; WebGazer Kalman
smoothing is disabled in this prototype.

Gaze observations use nullable confidence. WebGazer does not expose a reliable
confidence value, so the provider reports `confidence: null` rather than a
fabricated number. Lost predictions emit explicit lost observations so target
attention cannot remain active forever.

## Calibration

Calibration helpers use explicit 5, 9, 13, and 25 point layouts. The default UI
uses 9 training points followed by 5 held-out validation points. Training points
may update WebGazer; validation points only score accuracy.

Evaluation reports valid validation count, rejected samples, median and p90
pixel error, viewport-normalized error, quality, completion timestamp, and a
profile key. Profile keys bind calibration metadata to camera, capture size,
viewport size, device pixel ratio, and provider version.

## Hand Worker

`HandTrackingProvider` acquires its own lease from the shared camera source and
uses the owner video for capture. It starts lazily only when hand gestures are
enabled.

`FrameInferenceScheduler` keeps at most one inference in flight. If another
frame arrives while capture or worker inference is busy, the scheduler retains
only the newest pending frame and counts the older frame as dropped.

`HandTrackingWorkerClient` starts a module worker. The worker loads MediaPipe
Tasks Vision from local paths:

- `/vendor/mediapipe-tasks-vision/wasm`
- `/models/hand-landmarker/hand_landmarker.task`

The worker uses the CPU delegate and `VIDEO` mode with `numHands: 1`. It returns
compact hand observations and closes transferred `ImageBitmap`s on success,
error, or shutdown. There is no main-thread inference fallback.

## Gesture State Machine

`GestureRecognizer` is deterministic and camera-independent. It recognizes:

- pinch start and release commit with entry/exit hysteresis;
- pinch-drag updates after a stable pinch;
- open-palm hold as a cancellation/pause semantic;
- left and right swipes from bounded horizontal movement.

Thresholds live in `src/perception/hand/gesture-config.ts` and are initial
engineering defaults, not hardware claims.

## Fusion And Action Boundary

`MultimodalIntentArbiter` snapshots the eligible gaze target when pinch starts.
Pinch release may confirm only that frozen target. Gaze movement after pinch
start cannot retarget the gesture.

The arbiter emits typed semantic intents: confirm-target, cancel, navigate, and
drag-target. It never calls `.click()`, dispatches synthetic DOM clicks, invokes
native commands, or maps targets directly to `DeviceActionId`.

Future conversion from a multimodal intent to a device action must pass through
the existing declared capability and approval checks in
`src/device-control/action-broker.ts`.

## Occlusion

The prototype does not claim that a normal webcam can see through a hand. It
uses a conservative `occlusionSuspected` signal from normalized eye-region and
hand-box overlap when geometry is available. Temporal correlation between hand
presence and gaze loss is only a degraded fallback. Suspected occlusion can only
enable a short bounded hold.

## Privacy And Diagnostics

Camera input remains off by default. Loading the app does not load the hand
model and does not request camera permission. No runtime CDN or model download
is used.

Raw video, ImageBitmaps, eye crops, tensors, raw WebGazer predictions, and full
landmark histories are not persisted or uploaded. Preferences and compact
calibration summaries are the only local persistence in this slice.

`PerceptionTelemetry` is in-memory only. It tracks camera frame age, active
consumers, hand drops, inference percentiles, observation age, target dwell,
armed target, last gesture, last intent, cancellation reason, and worker status.

## Manual Benchmark Status

The code includes hooks for manual measurement, but these hardware criteria are
not claimed without a real-device run:

- stable camera cadence near 30 fps;
- gaze responsiveness while hand inference runs;
- hand output near 15 Hz;
- capture-to-gaze p95 below 80 ms;
- capture-to-hand p95 below 100 ms;
- combined-mode degradation below 15 percent versus solo branches;
- no serious thermal behavior during sustained use;
- gesture false activation below one per 30 minutes;
- fused accidental action below one per two hours.
