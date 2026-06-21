import { describe, expect, it } from "vitest";
import { GazeSmoother } from "@/gaze/smoothing";
import type { GazePoint } from "@/gaze/types";

describe("GazeSmoother", () => {
  it("clamps points to the viewport and normalizes coordinates", () => {
    const smoother = new GazeSmoother({ smoothingAlpha: 1, minConfidence: 0.1 });
    const smoothed = smoother.smooth(point({ viewportX: 1200, viewportY: -10 }), { width: 1000, height: 800 });

    expect(smoothed?.viewportX).toBe(1000);
    expect(smoothed?.viewportY).toBe(0);
    expect(smoothed?.normalizedX).toBe(1);
    expect(smoothed?.normalizedY).toBe(0);
  });

  it("smooths noisy input", () => {
    const smoother = new GazeSmoother({ smoothingAlpha: 0.25, minConfidence: 0.1 });
    smoother.smooth(point({ viewportX: 100, viewportY: 100, timestamp: 0 }), { width: 1000, height: 800 });
    const smoothed = smoother.smooth(point({ viewportX: 300, viewportY: 300, timestamp: 16 }), { width: 1000, height: 800 });

    expect(smoothed?.viewportX).toBe(150);
    expect(smoothed?.viewportY).toBe(150);
  });

  it("computes fixation after stable samples and resets after a large jump", () => {
    const smoother = new GazeSmoother({
      smoothingAlpha: 1,
      minConfidence: 0.1,
      fixationRadiusPx: 20,
      fixationMinMs: 100,
    });

    smoother.smooth(point({ viewportX: 100, viewportY: 100, timestamp: 0 }), { width: 1000, height: 800 });
    const stable = smoother.smooth(point({ viewportX: 106, viewportY: 104, timestamp: 140 }), { width: 1000, height: 800 });
    const jump = smoother.smooth(point({ viewportX: 400, viewportY: 400, timestamp: 150 }), { width: 1000, height: 800 });

    expect(stable?.isFixating).toBe(true);
    expect(jump?.isFixating).toBe(false);
  });

  it("drops low-confidence and invalid points", () => {
    const smoother = new GazeSmoother({ minConfidence: 0.5 });

    expect(smoother.smooth(point({ confidence: 0.2 }))).toBeNull();
    expect(smoother.smooth(point({ viewportX: Number.NaN }))).toBeNull();
  });
});

function point(overrides: Partial<GazePoint> = {}): GazePoint {
  return {
    viewportX: 100,
    viewportY: 100,
    normalizedX: 0.1,
    normalizedY: 0.1,
    confidence: 1,
    timestamp: 0,
    source: "mouse-simulated",
    ...overrides,
  };
}
