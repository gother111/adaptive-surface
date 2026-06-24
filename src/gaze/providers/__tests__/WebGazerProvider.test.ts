import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGazerProvider } from "@/gaze/providers/WebGazerProvider";
import type { CameraFrameSource, CameraLease } from "@/perception/camera";

describe("WebGazerProvider", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("injects the shared stream and avoids stopping it", async () => {
    const webgazer = createWebGazer();
    installWindow(webgazer);
    const camera = createCamera();
    const provider = new WebGazerProvider(camera);

    await provider.start({ debug: true });
    await provider.stop();

    expect(camera.acquire).toHaveBeenCalledTimes(1);
    expect(webgazer.setStaticVideo).toHaveBeenCalledWith(camera.stream);
    expect(webgazer.stopVideo).not.toHaveBeenCalled();
    expect(webgazer.removeMouseEventListeners).toHaveBeenCalled();
    expect(camera.release).toHaveBeenCalledTimes(1);
  });

  it("emits lost observations and nullable confidence", async () => {
    const webgazer = createWebGazer();
    installWindow(webgazer);
    const provider = new WebGazerProvider(createCamera());
    const observations: unknown[] = [];
    provider.subscribe((observation) => observations.push(observation));

    await provider.start();
    webgazer.listener?.(null, 1);
    webgazer.listener?.({ x: 25, y: 40 }, 2);

    expect(observations).toMatchObject([
      { point: null, confidence: null, trackingState: "lost" },
      { point: { viewportX: 25, viewportY: 40 }, confidence: null, trackingState: "usable" },
    ]);
  });

  it("releases the lease after startup failure", async () => {
    const webgazer = createWebGazer();
    webgazer.begin.mockRejectedValueOnce(new Error("boom"));
    installWindow(webgazer);
    const camera = createCamera();
    const provider = new WebGazerProvider(camera);

    await provider.start();

    expect(provider.getStatus()).toBe("error");
    expect(camera.release).toHaveBeenCalledTimes(1);
  });
});

function createWebGazer() {
  return {
    params: {},
    listener: null as (((data: { x: number; y: number } | null, elapsed: number) => void) | null),
    setStaticVideo: vi.fn().mockReturnThis(),
    setGazeListener: vi.fn(function (this: { listener: unknown }, listener) {
      this.listener = listener;
      return this;
    }),
    clearGazeListener: vi.fn().mockReturnThis(),
    begin: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    stopVideo: vi.fn(),
    removeMouseEventListeners: vi.fn().mockReturnThis(),
    applyKalmanFilter: vi.fn().mockReturnThis(),
    saveDataAcrossSessions: vi.fn().mockReturnThis(),
    showVideoPreview: vi.fn().mockReturnThis(),
    showVideo: vi.fn().mockReturnThis(),
    showFaceOverlay: vi.fn().mockReturnThis(),
    showFaceFeedbackBox: vi.fn().mockReturnThis(),
    showPredictionPoints: vi.fn().mockReturnThis(),
  };
}

function installWindow(webgazer: ReturnType<typeof createWebGazer>) {
  vi.stubGlobal("window", {
    webgazer,
    location: { href: "https://app.local/" },
    innerWidth: 100,
    innerHeight: 100,
  });
}

function createCamera() {
  const stream = {} as MediaStream;
  const release = vi.fn().mockResolvedValue(undefined);
  const lease = { consumerId: "webgazer", stream, video: {} as HTMLVideoElement, release } satisfies CameraLease;
  return {
    stream,
    release,
    acquire: vi.fn().mockResolvedValue(lease),
    getSnapshot: () => ({
      status: "active" as const,
      activeConsumerIds: ["webgazer"],
      width: 1280,
      height: 720,
      frameRate: 30,
      deviceId: "camera-1",
      latestFrameAt: 10,
      lastError: null,
    }),
    subscribe: vi.fn(),
    stopAll: vi.fn(),
  } satisfies CameraFrameSource & { stream: MediaStream; release: ReturnType<typeof vi.fn> };
}
