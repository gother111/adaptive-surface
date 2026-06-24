import { describe, expect, it } from "vitest";
import { PerceptionTelemetry } from "@/perception/telemetry";

describe("PerceptionTelemetry", () => {
  it("calculates rolling percentiles and dropped-frame counters in memory", () => {
    const telemetry = new PerceptionTelemetry();
    telemetry.recordHandFrame();
    telemetry.recordHandFrame({ droppedBusy: true });
    telemetry.recordHandInference(10);
    telemetry.recordHandInference(30);
    telemetry.recordHandInference(50);

    expect(telemetry.getSnapshot()).toMatchObject({
      handFramesConsidered: 2,
      handFramesDroppedBusy: 1,
      handInferenceP50Ms: 30,
      handInferenceP95Ms: 50,
    });
  });
});
