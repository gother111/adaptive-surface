import { describe, expect, it } from "vitest";
import { resolveGazeTarget } from "@/gaze/GazeTargetResolver";
import type { GazeTargetDescriptor, ResolvedGazeTarget, SmoothedGazePoint } from "@/gaze/types";

describe("resolveGazeTarget", () => {
  it("returns null without a usable point", () => {
    expect(resolveGazeTarget(null, [])).toBeNull();
    expect(resolveGazeTarget(point({ confidence: 0.1 }), [target("a", rect(0, 0, 100, 100))])).toBeNull();
  });

  it("returns the target when a point is inside its rect", () => {
    const resolved = resolveGazeTarget(point({ viewportX: 50, viewportY: 50 }), [
      target("card-1", rect(0, 0, 100, 100), { metadata: { label: "Card 1" } }),
    ]);

    expect(resolved?.id).toBe("card-1");
    expect(resolved?.metadata?.label).toBe("Card 1");
  });

  it("prefers higher-priority overlapping targets", () => {
    const resolved = resolveGazeTarget(point({ viewportX: 50, viewportY: 50 }), [
      target("low", rect(0, 0, 100, 100), { priority: 1 }),
      target("high", rect(0, 0, 100, 100), { priority: 5 }),
    ]);

    expect(resolved?.id).toBe("high");
  });

  it("applies hysteresis and tracks dwell", () => {
    const state: { previousTarget: ResolvedGazeTarget | null } = { previousTarget: null };
    const first = resolveGazeTarget(point({ viewportX: 50, viewportY: 50, timestamp: 1000 }), [
      target("a", rect(0, 0, 100, 100)),
    ], state);
    state.previousTarget = first;

    const second = resolveGazeTarget(point({ viewportX: 180, viewportY: 50, timestamp: 1100 }), [
      target("a", rect(0, 0, 100, 100)),
      target("b", rect(150, 0, 100, 100)),
    ], state);

    expect(second?.id).toBe("a");
    expect(second?.dwellMs).toBeGreaterThanOrEqual(0);
  });

  it("ignores disabled and zero-size targets", () => {
    const resolved = resolveGazeTarget(point({ viewportX: 10, viewportY: 10 }), [
      target("disabled", rect(0, 0, 100, 100), { disabled: true }),
      target("zero", rect(0, 0, 0, 0)),
    ]);

    expect(resolved).toBeNull();
  });

  it("chooses nearest target only within threshold", () => {
    const near = resolveGazeTarget(point({ viewportX: 130, viewportY: 50 }), [
      target("near", rect(0, 0, 100, 100)),
    ]);
    const far = resolveGazeTarget(point({ viewportX: 300, viewportY: 50 }), [
      target("far", rect(0, 0, 100, 100)),
    ]);

    expect(near?.id).toBe("near");
    expect(far).toBeNull();
  });
});

function point(overrides: Partial<SmoothedGazePoint> = {}): SmoothedGazePoint {
  return {
    viewportX: 10,
    viewportY: 10,
    normalizedX: 0.1,
    normalizedY: 0.1,
    confidence: 1,
    timestamp: 0,
    source: "mouse-simulated",
    isFixating: false,
    ...overrides,
  };
}

function target(
  id: string,
  targetRect: DOMRect,
  overrides: Partial<GazeTargetDescriptor> = {},
): GazeTargetDescriptor {
  return {
    id,
    type: "card",
    getRect: () => targetRect,
    ...overrides,
  };
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}
