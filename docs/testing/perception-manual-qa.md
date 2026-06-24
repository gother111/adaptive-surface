# Perception Manual QA

Run this only on a local development build where camera permission prompts are
expected. Do not run it as an automated test.

## Checklist

1. Gaze only: start WebGazer with hand gestures off. Confirm one camera
   indicator, calibration overlay, gaze focus, and no gesture status.
2. Hand only if supported: enable hand gestures with gaze off. Confirm the
   shared camera indicator says hand and the hand model loads locally.
3. Gaze plus hand: start both. Confirm the indicator says gaze + hand and a
   repeated start does not create a second camera session.
4. Camera permission denied: deny camera access. Confirm both branches show a
   typed error and mouse-simulated gaze still works.
5. Hand model load failure: temporarily rename the local `.task` file. Confirm
   hand shows an error and gaze remains usable.
6. Calibration cancellation: start calibration, press Escape, and confirm target
   focus and armed gestures clear.
7. Calibration good/fair/poor: run calibration under normal, offset, and poor
   lighting conditions. Confirm median and p90 error plus quality update.
8. Hand crossing the face: move a hand over the eye region. Confirm any gaze
   hold is brief and cancelled after the bounded timeout.
9. Rapid provider switching: switch off, mouse, webcam, and back. Confirm stale
   attention clears and no unhandled errors appear.
10. Repeated start/stop: repeat ten times. Confirm tracks stop on final release
    and no duplicate camera indicator appears.
11. App blur/hidden behavior: blur the app or hide the document. Confirm armed
    intents cancel.
12. Glasses, dim light, backlight: verify degraded gaze does not confirm targets
    and hand errors do not interrupt the gaze branch.
13. No duplicate camera prompt/session: start gaze, then enable hand. Confirm no
    second permission prompt occurs.
14. No gesture-caused DOM click: pinch over buttons and links. Confirm only a
    local receipt appears unless another approved modality acts.
15. Clear calibration: clear calibration and confirm WebGazer-local data plus
    Adaptive Surface summary metadata are cleared.

## Manual Metrics To Record

- delivered camera fps;
- capture-to-gaze p95;
- capture-to-hand p95;
- hand output rate;
- hand frame drop count;
- false gesture activations over time;
- temperature or thermal warnings during sustained use.
