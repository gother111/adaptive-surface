import type { CameraFrameSource, CameraLease, CameraSnapshot, CameraStatus } from "@/perception/camera/types";

const sharedCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: "user",
  },
};

interface SharedWebcamSourceOptions {
  mediaDevices?: MediaDevices | null;
  createVideo?: () => HTMLVideoElement;
  appendVideo?: (video: HTMLVideoElement) => void;
  removeVideo?: (video: HTMLVideoElement) => void;
  now?: () => number;
}

export class SharedWebcamSource implements CameraFrameSource {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private startupPromise: Promise<void> | null = null;
  private leases = new Map<string, CameraLease>();
  private stoppedTracks = new WeakSet<MediaStreamTrack>();
  private listeners = new Set<(snapshot: CameraSnapshot) => void>();
  private snapshot: CameraSnapshot = {
    status: "idle",
    activeConsumerIds: [],
    width: null,
    height: null,
    frameRate: null,
    deviceId: null,
    latestFrameAt: null,
    lastError: null,
  };

  constructor(private options: SharedWebcamSourceOptions = {}) {}

  async acquire(consumerId: string): Promise<CameraLease> {
    const existingLease = this.leases.get(consumerId);
    if (existingLease) {
      throw new Error(`Camera consumer already acquired: ${consumerId}`);
    }

    if (!this.stream || !this.video) {
      await this.ensureStarted();
    } else {
      this.updateSnapshot({ status: "active", lastError: null });
    }

    if (!this.stream || !this.video) {
      throw new Error("Shared webcam did not start.");
    }

    let released = false;
    const lease: CameraLease = {
      consumerId,
      stream: this.stream,
      video: this.video,
      release: async () => {
        if (released) return;
        released = true;
        this.leases.delete(consumerId);
        if (this.leases.size === 0) {
          await this.stopInternal("idle");
          return;
        }
        this.emit();
      },
    };

    this.leases.set(consumerId, lease);
    this.emit();
    return lease;
  }

  getSnapshot(): CameraSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: CameraSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async stopAll() {
    this.leases.clear();
    await this.stopInternal("idle");
  }

  setLatestFrameAt(capturedAt: number) {
    this.updateSnapshot({ latestFrameAt: capturedAt });
  }

  private async ensureStarted() {
    this.startupPromise ??= this.start();
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  private async start() {
    const mediaDevices = this.options.mediaDevices ?? (typeof navigator !== "undefined" ? navigator.mediaDevices : null);
    if (!mediaDevices?.getUserMedia) {
      this.updateSnapshot({ status: "unsupported", lastError: "Browser camera access is unavailable." });
      throw new Error("Browser camera access is unavailable.");
    }

    this.updateSnapshot({ status: "starting", lastError: null });

    try {
      const stream = await mediaDevices.getUserMedia(sharedCameraConstraints);
      const video = this.createOwnerVideo();
      video.srcObject = stream;
      this.attachEndedListeners(stream);
      this.stream = stream;
      this.video = video;
      this.options.appendVideo?.(video) ?? defaultAppendVideo(video);
      await safePlay(video);
      this.updateSnapshot({ ...settingsSnapshot(stream), status: "active", lastError: null });
    } catch (error) {
      this.stream = null;
      this.video = null;
      this.updateSnapshot({
        status: isPermissionError(error) ? "permission-denied" : "error",
        lastError: errorMessage(error),
      });
      throw error;
    }
  }

  private createOwnerVideo() {
    const video = this.options.createVideo?.() ?? document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.tabIndex = -1;
    video.setAttribute("aria-hidden", "true");
    video.setAttribute("data-adaptive-surface-camera-owner", "true");
    Object.assign(video.style, {
      position: "fixed",
      left: "-2px",
      top: "-2px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1",
    });
    return video;
  }

  private attachEndedListeners(stream: MediaStream) {
    for (const track of stream.getTracks()) {
      track.addEventListener?.("ended", () => {
        void this.stopInternal("ended");
      }, { once: true });
    }
  }

  private async stopInternal(status: CameraStatus) {
    const stream = this.stream;
    const video = this.video;
    this.stream = null;
    this.video = null;
    this.startupPromise = null;

    if (video) {
      video.pause?.();
      video.srcObject = null;
      this.options.removeVideo?.(video) ?? defaultRemoveVideo(video);
    }

    if (stream) {
      for (const track of stream.getTracks()) {
        if (!this.stoppedTracks.has(track)) {
          this.stoppedTracks.add(track);
          track.stop();
        }
      }
    }

    this.updateSnapshot({
      status,
      width: null,
      height: null,
      frameRate: null,
      deviceId: null,
      latestFrameAt: null,
    });
  }

  private updateSnapshot(patch: Partial<CameraSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      activeConsumerIds: [...this.leases.keys()],
    };
    this.emit();
  }

  private emit() {
    this.snapshot = { ...this.snapshot, activeConsumerIds: [...this.leases.keys()] };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export const sharedWebcamSource = new SharedWebcamSource();

function settingsSnapshot(stream: MediaStream): Pick<CameraSnapshot, "width" | "height" | "frameRate" | "deviceId"> {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  return {
    width: typeof settings.width === "number" ? settings.width : null,
    height: typeof settings.height === "number" ? settings.height : null,
    frameRate: typeof settings.frameRate === "number" ? settings.frameRate : null,
    deviceId: typeof settings.deviceId === "string" ? settings.deviceId : null,
  };
}

async function safePlay(video: HTMLVideoElement) {
  try {
    await video.play?.();
  } catch {
    // WebKit can defer autoplay until the stream is ready; frame consumers still use the same owner element.
  }
}

function defaultAppendVideo(video: HTMLVideoElement) {
  if (typeof document === "undefined") return;
  document.body.appendChild(video);
}

function defaultRemoveVideo(video: HTMLVideoElement) {
  video.remove?.();
}

function isPermissionError(error: unknown) {
  return /permission|denied|notallowed/i.test(errorMessage(error));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}
