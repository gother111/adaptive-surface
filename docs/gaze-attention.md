# Gaze And Gesture Attention Layer

Adaptive Surface has a local perception layer for the interaction model:

```text
Look to focus. Speak, type, click, or use a deliberate gesture to act.
```

Gaze does not move the macOS cursor, click, select, submit, send, write files, or
commit actions. It only nominates the semantic target the user is probably
looking at so voice, keyboard, or pointer input can resolve phrases like "this"
or "that" in a later command path.

The product rule is:

```text
Gaze determines where. A deliberate modality determines what and when.
```

## Providers

The provider architecture lives in `src/gaze/`.

- `off`: default provider. No listeners, no camera, no permission prompt.
- `mouse-simulated`: development provider that emits high-confidence gaze points
  from pointer movement. This is the deterministic test path.
- `webgazer`: experimental webcam provider that lazy-loads WebGazer after the
  user explicitly clicks `Start`, consumes Adaptive Surface's shared camera
  stream, and uses explicit training points only during calibration.
- `webeyetrack-placeholder`: reserved provider id for a future engine.

WebGazer is installed for the local Mac prototype. Current npm metadata for
`webgazer` reports `GPL-3.0-or-later`, so this dependency should be reviewed
before any commercial redistribution. Treat WebGazer as a replaceable research
provider, not as the production gaze engine.

Hand gesture confirmation is opt-in and uses a Web Worker with the locally
vendored MediaPipe Tasks Vision hand landmarker model. Gesture recognition emits
typed semantic intents such as confirm, cancel, navigate, or drag-target. It does
not dispatch DOM clicks and does not map targets directly to device actions.

## Privacy Guarantees

- Camera gaze is off by default and starts only after the user chooses `Webcam`
  and clicks `Start`.
- Hand gestures are off by default. Normal startup does not load the hand model,
  load webcam code, or request camera permission.
- Mouse simulation does not touch the camera.
- The app persists only gaze and gesture preferences in local storage.
- Raw video, camera frames, ImageBitmaps, model tensors, continuous gaze streams,
  full landmark histories, and raw WebGazer objects are not persisted or
  uploaded.
- There is no analytics path for gaze points.
- Calibration can be cleared from the developer gaze panel.

Clearing calibration clears WebGazer-local data and Adaptive Surface calibration
metadata. If a future approved webcam provider stores calibration model data
internally, that storage must remain local and must be covered by the same clear
calibration action.

## Shared Camera Ownership

`src/perception/camera/SharedWebcamSource.ts` is the one browser-side owner of
`navigator.mediaDevices.getUserMedia()` for this feature. Gaze and hand tracking
receive reference-counted leases for the same `MediaStream` and hidden owner
video. Releasing one consumer does not stop the stream while another consumer is
still active. The final release stops each track once.

The canonical processing coordinate system is normalized `[0, 1]`, unmirrored,
origin top-left. Mirroring is presentation-only.

## Enabling Mouse-Simulated Gaze

1. Click the `Gaze` control in the top-right app chrome.
2. In Gaze attention, choose `Mouse`.
3. Click `Start`.
4. Move the pointer across visible workspace surfaces.
5. Confirm the subtle focus ring follows large semantic targets.
6. Optionally enable `Show gaze debug` to inspect provider, point, target, dwell,
   and calibration state.

## Enabling Webcam Gaze

1. Click the `Gaze` control in the top-right app chrome.
2. In Gaze attention, choose `Webcam`.
3. Optional: enable `Show gaze debug` while testing.
4. Click `Start` and allow camera access when macOS asks.
5. Wait for the status to become `active`, then click `Calibrate`.
6. Look at each calibration dot and click it, or press Space.
7. After calibration, a circular highlighted gaze area should follow the
   estimated look point when no semantic target is under it. When the estimate
   lands on a registered workspace surface, the app shows a rectangular focus
   ring around that area.

Calibration uses separate training and validation targets. Training samples call
WebGazer's local `recordScreenPosition` API. Validation samples never train
WebGazer; they score median and p90 error against held-out targets. The app
stores only preferences and compact calibration summary metadata unless a future
approved provider explicitly adds local calibration persistence.

## Hand Gesture Confirmation

1. Click the `Gaze` control.
2. Enable `Hand gesture confirmation`.
3. Start webcam gaze or hand-only camera input.
4. Use a stable pinch to arm the current eligible gaze target, then release to
   confirm the frozen target.
5. Use an open palm to cancel. Horizontal swipes emit typed navigation intents.

The hand branch runs inference in a Web Worker. The main thread keeps at most
one capture/inference request in flight and drops obsolete frames while busy.

## Webcam Follow-Up

Before redistribution, make these explicit decisions:

- Approve or reject the `webgazer` GPL dependency.
- Keep `NSCameraUsageDescription` in `src-tauri/Info.plist`; macOS will not
  allow the native WebView to request camera access without it.
- Automated tests must not require a real webcam.

Current permission copy:

```text
Adaptive Surface uses the camera only when you enable gaze or hand input, to
estimate which surface you are looking at and recognize deliberate gestures.
Video stays on this Mac and is not recorded or uploaded.
```

## Adding Gaze Targets

Wrap large, meaningful UI regions:

```tsx
<GazeTarget
  id={`surface:${surface.id}`}
  type="surface"
  metadata={{
    label: "Calendar",
    entityId: surface.id,
    actionHints: ["open", "summarize", "focus"],
  }}
>
  <CalendarPanel />
</GazeTarget>
```

Do not register every small button by default. Start with stable regions such as
surface cards, document panels, table frames, person chips, and file tiles.

## Attention API

Voice and intent code can consume the current target through:

```ts
import {
  getCurrentAttention,
  getCurrentAttentionTarget,
  subscribeToAttentionTarget,
} from "@/gaze/attention";
```

The current priority model is intentionally simple:

1. Explicit UI selection should beat gaze.
2. Keyboard focus should beat gaze.
3. Active pointer drag or hover should beat gaze.
4. Gaze can resolve "this", "that", "it", "here", or "there".
5. Active surface remains the fallback.

This pass exposes the API but does not rewrite the existing voice router.

Multimodal fusion lives under `src/perception/fusion/`. It exposes typed intents
only. Any future conversion from a multimodal intent into a device action must
continue through the declared capability and approval boundary in
`src/device-control/action-broker.ts`.

## Known Limitations

- WebGazer remains experimental and should be replaced behind the provider
  boundary before production reliance.
- Calibration quality is scored from held-out validation samples, but real-world
  webcam accuracy still depends on lighting, camera placement, glasses, and
  posture.
- Registered targets are currently workspace surfaces, not inner rows or chips.
- Hardware benchmark targets are documented but not claimed without a real Mac
  manual run.
