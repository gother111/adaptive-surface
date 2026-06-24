import { describe, expect, it } from "vitest";
import { MultimodalIntentArbiter } from "@/perception/fusion/MultimodalIntentArbiter";
import { canExecuteDeviceAction } from "@/device-control/action-broker";
import type { GazeObservation, ResolvedGazeTarget } from "@/gaze/types";
import type { GestureEvent } from "@/perception/hand/types";

describe("MultimodalIntentArbiter", () => {
  it("snapshots the eligible target at pinch start and does not retarget on release", () => {
    const arbiter = new MultimodalIntentArbiter();
    arbiter.ingestGaze(context(target("a", 500), observation(500)));
    expect(arbiter.ingestGesture(gesture("pinch", "started", 520))).toMatchObject({ kind: "drag-target", target: { id: "a" } });

    arbiter.ingestGaze(context(target("b", 560), observation(560)));
    const intent = arbiter.ingestGesture(gesture("pinch", "committed", 700));

    expect(intent).toMatchObject({ kind: "confirm-target", target: { id: "a" } });
  });

  it("gates webcam confirmation on calibration quality", () => {
    const arbiter = new MultimodalIntentArbiter();
    arbiter.ingestGaze(context(target("a", 500, "webgazer"), observation(500), { status: "complete", quality: "poor" }));

    expect(arbiter.ingestGesture(gesture("pinch", "started", 540))).toBeNull();
  });

  it("emits navigation and cancellation without executing device actions", () => {
    const arbiter = new MultimodalIntentArbiter();
    expect(arbiter.ingestGesture(gesture("swipe-left", "committed", 100))).toMatchObject({ kind: "navigate", direction: "left" });
    expect(canExecuteDeviceAction("desktop.pasteText", { approved: false }).ok).toBe(false);
    expect(arbiter.ingestGesture(gesture("open-palm", "committed", 700))).toMatchObject({ kind: "cancel", source: "open-palm" });
  });

  it("cancels when the target is no longer registered", () => {
    const arbiter = new MultimodalIntentArbiter();
    arbiter.ingestGaze(context(target("a", 500), observation(500)));
    arbiter.ingestGesture(gesture("pinch", "started", 520));

    const intent = arbiter.ingestGaze({
      ...context(target("a", 540), observation(540)),
      targetStillRegistered: () => false,
    });

    expect(intent).toMatchObject({ kind: "cancel", source: "target-invalid" });
  });
});

function context(
  targetValue: ResolvedGazeTarget,
  observationValue: GazeObservation,
  calibration: { status: "complete"; quality: "good" | "fair" | "poor" } = { status: "complete", quality: "good" },
) {
  return {
    target: targetValue,
    observation: observationValue,
    calibration: {
      ...calibration,
      sampleCount: 5,
    },
    targetStillRegistered: () => true,
  };
}

function target(id: string, at: number, source: "mouse-simulated" | "webgazer" = "mouse-simulated"): ResolvedGazeTarget {
  return {
    id,
    type: "card",
    confidence: source === "webgazer" ? null : 1,
    dwellMs: 240,
    rect: { x: 0, y: 0, width: 100, height: 100, left: 0, top: 0, right: 100, bottom: 100, toJSON: () => ({}) } as DOMRect,
    metadata: { label: id },
    resolvedAt: at,
    activeSince: at - 240,
    lastObservedAt: at,
    source,
  };
}

function observation(at: number): GazeObservation {
  return {
    sequence: at,
    capturedAt: at,
    emittedAt: at,
    point: { viewportX: 10, viewportY: 10, normalizedX: 0.1, normalizedY: 0.1 },
    confidence: null,
    trackingState: "usable",
    facePresent: true,
    eyesOpen: null,
    source: "webgazer",
  };
}

function gesture(kind: GestureEvent["kind"], phase: GestureEvent["phase"], at: number): GestureEvent {
  return {
    kind,
    phase,
    startedAt: at - 100,
    updatedAt: at,
    committedAt: phase === "committed" ? at : undefined,
    centroid: { x: 0.5, y: 0.5 },
    delta: { x: 0, y: 0 },
  };
}
