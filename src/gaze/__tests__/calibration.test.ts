import { describe, expect, it } from "vitest";
import { createCalibrationTargets, evaluateCalibration } from "@/gaze/calibration";

describe("calibration helpers", () => {
  it("generates bounded 9-point calibration targets", () => {
    const targets = createCalibrationTargets(9);

    expect(targets).toHaveLength(9);
    expect(targets.every((target) => target.x > 0 && target.x < 1 && target.y > 0 && target.y < 1)).toBe(true);
  });

  it("reports quality from measured samples", () => {
    const state = evaluateCalibration([
      { targetX: 100, targetY: 100, measuredX: 104, measuredY: 96, timestamp: 1 },
      { targetX: 500, targetY: 100, measuredX: 508, measuredY: 105, timestamp: 2 },
      { targetX: 900, targetY: 100, measuredX: 910, measuredY: 110, timestamp: 3 },
      { targetX: 100, targetY: 500, measuredX: 108, measuredY: 504, timestamp: 4 },
      { targetX: 500, targetY: 500, measuredX: 498, measuredY: 506, timestamp: 5 },
    ]);

    expect(state.status).toBe("complete");
    expect(state.quality).toBe("good");
  });

  it("keeps unknown quality when there are no measured samples", () => {
    expect(evaluateCalibration([{ targetX: 100, targetY: 100, timestamp: 1 }]).quality).toBe("unknown");
  });
});
