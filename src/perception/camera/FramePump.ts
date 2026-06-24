import type { FrameEnvelope } from "@/perception/camera/types";

type VideoFrameRequestCallback = (now: number, metadata: { mediaTime: number; width?: number; height?: number }) => void;

type FramePumpVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class FramePump {
  private sequence = 0;
  private listeners = new Set<(frame: FrameEnvelope) => void>();
  private running = false;
  private callbackHandle: number | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private latest: FrameEnvelope | null = null;

  constructor(
    private video: FramePumpVideo,
    private options: { fallbackIntervalMs?: number; now?: () => number } = {},
  ) {}

  subscribe(listener: (frame: FrameEnvelope) => void) {
    this.listeners.add(listener);
    if (!this.running) {
      this.start();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  getLatest() {
    return this.latest;
  }

  stop() {
    this.running = false;
    if (this.callbackHandle !== null) {
      this.video.cancelVideoFrameCallback?.(this.callbackHandle);
      this.callbackHandle = null;
    }
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private start() {
    this.running = true;
    this.schedule();
  }

  private schedule() {
    if (!this.running) return;

    if (this.video.requestVideoFrameCallback) {
      this.callbackHandle = this.video.requestVideoFrameCallback((now) => {
        this.callbackHandle = null;
        this.emitFrame(now);
        this.schedule();
      });
      return;
    }

    this.timeoutHandle = setTimeout(() => {
      this.timeoutHandle = null;
      this.emitFrame(this.options.now?.() ?? performance.now());
      this.schedule();
    }, this.options.fallbackIntervalMs ?? 33);
  }

  private emitFrame(capturedAt: number) {
    const frame: FrameEnvelope = {
      sequence: ++this.sequence,
      capturedAt,
      width: this.video.videoWidth || this.video.clientWidth || 0,
      height: this.video.videoHeight || this.video.clientHeight || 0,
      mirrored: false,
    };
    this.latest = frame;
    this.listeners.forEach((listener) => listener(frame));
  }
}
