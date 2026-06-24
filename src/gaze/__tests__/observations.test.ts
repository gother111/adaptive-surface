import { describe, expect, it } from "vitest";
import { shouldAcceptGazeObservation } from "@/gaze/observations";
import type { GazeObservation } from "@/gaze/types";

describe("shouldAcceptGazeObservation", () => {
  it("rejects duplicate and out-of-order observations", () => {
    const cursor = { latestSequence: 5, latestCapturedAt: 500 };

    expect(shouldAcceptGazeObservation(observation(5, 520), cursor, { now: 530, maxAgeMs: 200 })).toMatchObject({
      accept: false,
      reason: "out-of-order",
    });
    expect(shouldAcceptGazeObservation(observation(6, 490), cursor, { now: 530, maxAgeMs: 200 })).toMatchObject({
      accept: false,
      reason: "out-of-order",
    });
  });

  it("rejects stale observations and accepts fresh lost observations", () => {
    const cursor = { latestSequence: 1, latestCapturedAt: 100 };

    expect(shouldAcceptGazeObservation(observation(2, 100), cursor, { now: 400, maxAgeMs: 200 })).toMatchObject({
      accept: false,
      reason: "stale",
    });
    expect(shouldAcceptGazeObservation(observation(2, 240, null), cursor, { now: 300, maxAgeMs: 200 })).toMatchObject({
      accept: true,
    });
  });
});

function observation(sequence: number, capturedAt: number, point: GazeObservation["point"] = {
  viewportX: 10,
  viewportY: 10,
  normalizedX: 0.1,
  normalizedY: 0.1,
}): GazeObservation {
  return {
    sequence,
    capturedAt,
    emittedAt: capturedAt,
    point,
    confidence: null,
    trackingState: point ? "usable" : "lost",
    facePresent: null,
    eyesOpen: null,
    source: "webgazer",
  };
}
