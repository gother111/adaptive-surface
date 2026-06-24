import type { FrameEnvelope } from "@/perception/camera/types";

export interface FrameInferenceStats {
  considered: number;
  droppedBusy: number;
  completed: number;
}

export class FrameInferenceScheduler {
  private inFlight = false;
  private pending: FrameEnvelope | null = null;
  private cancelled = false;
  private stats: FrameInferenceStats = { considered: 0, droppedBusy: 0, completed: 0 };

  constructor(
    private capture: (frame: FrameEnvelope) => Promise<void>,
    private options: { targetFps?: number } = {},
  ) {}

  consider(frame: FrameEnvelope) {
    this.stats.considered += 1;
    if (this.cancelled) return;

    if (this.inFlight) {
      this.pending = frame;
      this.stats.droppedBusy += 1;
      return;
    }

    void this.process(frame);
  }

  cancel() {
    this.cancelled = true;
    this.pending = null;
  }

  getStats() {
    return this.stats;
  }

  private async process(frame: FrameEnvelope) {
    this.inFlight = true;
    try {
      await this.capture(frame);
      this.stats.completed += 1;
    } finally {
      this.inFlight = false;
      const pending = this.pending;
      this.pending = null;
      if (pending && !this.cancelled) {
        const minInterval = 1000 / (this.options.targetFps ?? 15);
        if (pending.capturedAt - frame.capturedAt >= minInterval) {
          void this.process(pending);
        }
      }
    }
  }
}
