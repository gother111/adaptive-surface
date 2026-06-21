# Gaze Attention Layer

Adaptive Surface now has a local gaze attention layer for the interaction model:

```text
Look to focus. Speak to act.
```

Gaze does not move the macOS cursor, click, select, submit, send, write files, or
commit actions. It only nominates the semantic target the user is probably
looking at so voice, keyboard, or pointer input can resolve phrases like "this"
or "that" in a later command path.

## Providers

The provider architecture lives in `src/gaze/`.

- `off`: default provider. No listeners, no camera, no permission prompt.
- `mouse-simulated`: development provider that emits high-confidence gaze points
  from pointer movement. This is the deterministic test path.
- `webgazer`: webcam provider that lazy-loads the WebGazer package after the
  user explicitly clicks `Start`, then uses calibration clicks to train the
  local gaze estimator.
- `webeyetrack-placeholder`: reserved provider id for a future engine.

WebGazer is installed for the local Mac prototype. Current npm metadata for
`webgazer` reports `GPL-3.0-or-later`, so this dependency should be reviewed
before any commercial redistribution.

## Privacy Guarantees

- Camera gaze is off by default and starts only after the user chooses `Webcam`
  and clicks `Start`.
- Normal startup does not load webcam code and does not request camera
  permission.
- Mouse simulation does not touch the camera.
- The app persists only gaze preferences in local storage.
- Raw video, camera frames, continuous gaze streams, and raw WebGazer objects are
  not persisted or uploaded.
- There is no analytics path for gaze points.
- Calibration can be cleared from the developer gaze panel.

If a future approved webcam provider stores calibration model data internally,
that storage must remain local and must be covered by the clear calibration
action.

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

Calibration records target positions through WebGazer's local
`recordScreenPosition` API. The app still stores only preferences unless a
future approved provider explicitly adds local calibration persistence.

## Webcam Follow-Up

Before redistribution, make these explicit decisions:

- Approve or reject the `webgazer` GPL dependency.
- Keep `NSCameraUsageDescription` in `src-tauri/Info.plist`; macOS will not
  allow the native WebView to request camera access without it.
- Add provider tests using a mocked WebGazer object. Automated tests must not
  require a real webcam.

Suggested permission copy:

```text
Adaptive Surface uses the camera only when you enable gaze attention, to estimate
what surface element you are looking at. Video stays on this device.
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

## Known Limitations

- Calibration quality is basic and uses local samples from the overlay.
- Registered targets are currently workspace surfaces, not inner rows or chips.
- Webcam accuracy depends on lighting, camera placement, and calibration sample
  quality.
