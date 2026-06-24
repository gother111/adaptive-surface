import { describe, expect, it } from "vitest";
import { GestureRecognizer } from "@/perception/hand/GestureRecognizer";
import type { HandObservation, NormalizedLandmark } from "@/perception/hand/types";

describe("GestureRecognizer", () => {
  it("starts and commits a stable pinch release", () => {
    const recognizer = new GestureRecognizer();
    expect(recognizer.ingest(obs(0, pinchHand()))).toEqual([]);
    const started = recognizer.ingest(obs(140, pinchHand()));
    const committed = recognizer.ingest(obs(180, openPinchHand()));

    expect(started[0]).toMatchObject({ kind: "pinch", phase: "started" });
    expect(committed[0]).toMatchObject({ kind: "pinch", phase: "committed" });
  });

  it("does not commit from one noisy pinch frame", () => {
    const recognizer = new GestureRecognizer();
    expect(recognizer.ingest(obs(0, pinchHand()))).toEqual([]);
    expect(recognizer.ingest(obs(20, openPinchHand()))).toEqual([]);
  });

  it("cancels pinch on hand loss", () => {
    const recognizer = new GestureRecognizer();
    recognizer.ingest(obs(0, pinchHand()));
    recognizer.ingest(obs(140, pinchHand()));
    const events = recognizer.ingest({ ...obs(180, []), handPresent: false, landmarks: [] });

    expect(events[0]).toMatchObject({ kind: "pinch", phase: "cancelled", reason: "hand-lost" });
  });

  it("emits pinch-drag updates", () => {
    const recognizer = new GestureRecognizer();
    recognizer.ingest(obs(0, pinchHand()));
    recognizer.ingest(obs(140, pinchHand()));
    const events = recognizer.ingest(obs(180, pinchHand(0.08)));

    expect(events[0]).toMatchObject({ kind: "pinch-drag", phase: "updated" });
  });

  it("recognizes left and right swipes but not vertical movement", () => {
    const left = new GestureRecognizer();
    left.ingest(obs(0, openHand(0.7, 0.4)));
    expect(left.ingest(obs(300, openHand(0.35, 0.42)))[0]).toMatchObject({ kind: "swipe-left" });

    const right = new GestureRecognizer();
    right.ingest(obs(0, openHand(0.3, 0.4)));
    expect(right.ingest(obs(300, openHand(0.65, 0.42)))[0]).toMatchObject({ kind: "swipe-right" });

    const vertical = new GestureRecognizer();
    vertical.ingest(obs(0, openHand(0.4, 0.2)));
    expect(vertical.ingest(obs(300, openHand(0.42, 0.7))).some((event) => event.kind === "swipe-left" || event.kind === "swipe-right")).toBe(false);
  });

  it("recognizes open-palm hold and applies cooldown", () => {
    const recognizer = new GestureRecognizer();
    recognizer.ingest(obs(0, openHand()));
    const events = recognizer.ingest(obs(280, openHand()));
    const duplicate = recognizer.ingest(obs(300, openHand()));

    expect(events[0]).toMatchObject({ kind: "open-palm", phase: "committed" });
    expect(duplicate).toEqual([]);
  });
});

function obs(capturedAt: number, landmarks: NormalizedLandmark[]): HandObservation {
  return {
    sequence: capturedAt,
    capturedAt,
    emittedAt: capturedAt,
    handPresent: landmarks.length > 0,
    handedness: "right",
    trackingConfidence: null,
    boundingBox: null,
    landmarks,
  };
}

function pinchHand(offset = 0): NormalizedLandmark[] {
  const hand = openHand(0.5 + offset, 0.5);
  hand[4] = { x: 0.5 + offset, y: 0.45 };
  hand[8] = { x: 0.51 + offset, y: 0.45 };
  return hand;
}

function openPinchHand(): NormalizedLandmark[] {
  const hand = openHand();
  hand[4] = { x: 0.4, y: 0.45 };
  hand[8] = { x: 0.65, y: 0.45 };
  return hand;
}

function openHand(cx = 0.5, cy = 0.5): NormalizedLandmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  points[0] = { x: cx, y: cy + 0.16 };
  points[5] = { x: cx - 0.08, y: cy + 0.02 };
  points[9] = { x: cx, y: cy };
  points[17] = { x: cx + 0.08, y: cy + 0.02 };
  points[4] = { x: cx - 0.16, y: cy - 0.06 };
  points[8] = { x: cx - 0.15, y: cy - 0.22 };
  points[12] = { x: cx - 0.05, y: cy - 0.25 };
  points[16] = { x: cx + 0.07, y: cy - 0.24 };
  points[20] = { x: cx + 0.18, y: cy - 0.2 };
  return points;
}
