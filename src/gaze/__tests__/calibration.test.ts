import { describe, expect, it } from "vitest";
import {
  calibrationProfileMatches,
  createCalibrationProfileKey,
  createCalibrationTargets,
  evaluateCalibration,
} from "@/gaze/calibration";

describe("calibration helpers", () => {
  it("generates bounded 9-point calibration targets", () => {
    const targets = createCalibrationTargets(9);

    expect(targets).toHaveLength(9);
    expect(targets.every((target) => target.x > 0 && target.x < 1 && target.y > 0 && target.y < 1)).toBe(true);
  });

  it("generates exactly 13 intentional points", () => {
    const targets = createCalibrationTargets(13);
    const unique = new Set(targets.map((target) => `${target.x}:${target.y}`));

    expect(targets).toHaveLength(13);
    expect(unique.size).toBe(13);
  });

  it("reports quality from measured samples", () => {
    const state = evaluateCalibration([
      { targetX: 0, targetY: 0, measuredX: 400, measuredY: 400, timestamp: 0, phase: "training" },
      { targetX: 100, targetY: 100, measuredX: 104, measuredY: 96, timestamp: 1, phase: "validation" },
      { targetX: 500, targetY: 100, measuredX: 508, measuredY: 105, timestamp: 2, phase: "validation" },
      { targetX: 900, targetY: 100, measuredX: 910, measuredY: 110, timestamp: 3, phase: "validation" },
      { targetX: 100, targetY: 500, measuredX: 108, measuredY: 504, timestamp: 4, phase: "validation" },
      { targetX: 500, targetY: 500, measuredX: 498, measuredY: 506, timestamp: 5, phase: "validation" },
    ]);

    expect(state.status).toBe("complete");
    expect(state.quality).toBe("good");
    expect(state.validValidationPointCount).toBe(5);
    expect(state.medianErrorPx).toBeGreaterThan(0);
    expect(state.p90ErrorPx).toBeGreaterThanOrEqual(state.medianErrorPx ?? 0);
  });

  it("keeps unknown quality when there are no measured samples", () => {
    expect(evaluateCalibration([{ targetX: 100, targetY: 100, timestamp: 1 }]).quality).toBe("unknown");
  });

  it("does not complete with incomplete validation and counts rejected samples", () => {
    const state = evaluateCalibration([
      { targetX: 100, targetY: 100, timestamp: 1, phase: "validation", accepted: false },
      { targetX: 200, targetY: 200, measuredX: 210, measuredY: 210, timestamp: 2, phase: "validation" },
    ]);

    expect(state.status).not.toBe("complete");
    expect(state.rejectedSampleCount).toBe(1);
  });

  it("binds calibration to profile metadata", () => {
    const profile = {
      cameraKey: "cam-a",
      captureWidth: 1280,
      captureHeight: 720,
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      providerVersion: "webgazer:test",
    };
    const key = createCalibrationProfileKey(profile);

    expect(calibrationProfileMatches(key, profile).valid).toBe(true);
    expect(calibrationProfileMatches(key, { ...profile, viewportWidth: 1200 })).toMatchObject({
      valid: false,
      reason: "camera-or-viewport-changed",
    });
  });
});
