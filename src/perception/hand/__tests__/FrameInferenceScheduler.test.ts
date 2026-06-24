import { describe, expect, it, vi } from "vitest";
import { FrameInferenceScheduler } from "@/perception/hand/FrameInferenceScheduler";

describe("FrameInferenceScheduler", () => {
  it("keeps one inference in flight and drops obsolete busy frames", async () => {
    let release = () => {};
    const capture = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    const scheduler = new FrameInferenceScheduler(capture, { targetFps: 15 });

    scheduler.consider(frame(1, 0));
    scheduler.consider(frame(2, 20));
    scheduler.consider(frame(3, 90));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(scheduler.getStats().droppedBusy).toBe(2);

    release();
    await Promise.resolve();
    await Promise.resolve();

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls[1]?.[0]).toMatchObject({ sequence: 3 });
  });
});

function frame(sequence: number, capturedAt: number) {
  return { sequence, capturedAt, width: 640, height: 480, mirrored: false as const };
}
