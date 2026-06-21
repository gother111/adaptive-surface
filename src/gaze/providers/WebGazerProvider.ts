import { initialCalibration } from "@/gaze/config";
import { ProviderEvents } from "@/gaze/providers/ProviderEvents";
import type {
  GazeCalibrationOptions,
  GazeCalibrationSample,
  GazeCalibrationState,
  GazeInputProvider,
  GazePoint,
  GazeProviderStatus,
  GazeStartOptions,
} from "@/gaze/types";

type WebGazerLike = {
  params?: {
    faceMeshSolutionPath?: string;
    camConstraints?: MediaStreamConstraints;
  };
  setGazeListener?: (listener: (data: { x: number; y: number } | null, elapsedTime: number) => void) => WebGazerLike;
  clearGazeListener?: () => WebGazerLike;
  begin?: () => Promise<void> | WebGazerLike;
  end?: () => Promise<void> | void;
  stopVideo?: () => WebGazerLike | void;
  pause?: () => WebGazerLike | void;
  resume?: () => WebGazerLike | void;
  saveDataAcrossSessions?: (persist: boolean) => WebGazerLike;
  showVideo?: (show: boolean) => WebGazerLike;
  showVideoPreview?: (show: boolean) => WebGazerLike;
  showFaceOverlay?: (show: boolean) => WebGazerLike;
  showFaceFeedbackBox?: (show: boolean) => WebGazerLike;
  showPredictionPoints?: (show: boolean) => WebGazerLike;
  recordScreenPosition?: (x: number, y: number, eventType?: "click" | "move") => WebGazerLike;
  clearData?: () => WebGazerLike | void;
};

declare global {
  interface Window {
    webgazer?: WebGazerLike;
  }
}

let webgazerScriptLoad: Promise<WebGazerLike | null> | null = null;

export class WebGazerProvider implements GazeInputProvider {
  id = "webgazer" as const;
  label = "Built-in webcam";
  capabilities = {
    requiresCamera: true,
    supportsCalibration: true,
    supportsPause: true,
    supportsConfidence: false,
    supportsRawDebug: true,
  };

  private events = new ProviderEvents();
  private status: GazeProviderStatus = "idle";
  private webgazer: WebGazerLike | null = null;

  getStatus() {
    return this.status;
  }

  async start(options: GazeStartOptions = {}) {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus("unsupported");
      return;
    }

    this.setStatus("starting");
    const webgazer = await loadWebGazer();
    if (!webgazer?.setGazeListener || !webgazer.begin) {
      this.setStatus("unsupported");
      return;
    }

    this.webgazer = webgazer;

    try {
      configureWebGazer(webgazer, options);
      webgazer.setGazeListener?.((prediction) => {
        if (!prediction) return;
        const point = toGazePoint(prediction);
        if (point) this.events.emitPoint(point);
      });
      await webgazer.begin();
      this.setStatus("active");
    } catch (error) {
      this.webgazer = null;
      this.setStatus(isPermissionError(error) ? "permission-denied" : "error");
    }
  }

  async stop() {
    try {
      this.webgazer?.clearGazeListener?.();
      try {
        this.webgazer?.stopVideo?.();
      } catch {
        // WebGazer may throw if startup failed before DOM video nodes were created.
      }
      try {
        await this.webgazer?.end?.();
      } catch {
        // WebGazer may throw if the preview container was already removed.
      }
    } finally {
      this.webgazer = null;
      this.setStatus("idle");
    }
  }

  async pause() {
    this.webgazer?.pause?.();
    this.setStatus("paused");
  }

  async resume() {
    this.webgazer?.resume?.();
    this.setStatus(this.webgazer ? "active" : "idle");
  }

  async calibrate(options: GazeCalibrationOptions = {}): Promise<GazeCalibrationState> {
    return {
      ...initialCalibration,
      status: this.webgazer ? "complete" : "failed",
      sampleCount: options.pointCount ?? 9,
      quality: this.webgazer ? "fair" : "unknown",
      completedAt: this.webgazer ? Date.now() : undefined,
    };
  }

  recordCalibrationSample(sample: GazeCalibrationSample) {
    if (!this.webgazer?.recordScreenPosition) return;

    this.webgazer.recordScreenPosition(sample.targetX, sample.targetY, "click");
  }

  async clearCalibration() {
    this.webgazer?.clearData?.();
  }

  subscribe(listener: (point: GazePoint) => void) {
    return this.events.subscribe(listener);
  }

  onStatusChange(listener: (status: GazeProviderStatus) => void) {
    return this.events.onStatusChange(listener);
  }

  private setStatus(status: GazeProviderStatus) {
    this.status = status;
    this.events.emitStatus(status);
  }
}

async function loadWebGazer(): Promise<WebGazerLike | null> {
  if (window.webgazer) {
    return window.webgazer;
  }

  webgazerScriptLoad ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = new URL("/vendor/webgazer/webgazer.js", window.location.href).toString();
    script.async = true;
    script.onload = () => resolve(window.webgazer ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return webgazerScriptLoad;
}

function configureWebGazer(webgazer: WebGazerLike, options: GazeStartOptions) {
  const showDebugPreview = Boolean(options.showPreview || options.debug);

  if (webgazer.params) {
    webgazer.params.faceMeshSolutionPath = new URL("/mediapipe/face_mesh", window.location.href).toString();
    webgazer.params.camConstraints = {
      video: {
        width: { min: 320, ideal: 640, max: 1280 },
        height: { min: 240, ideal: 480, max: 720 },
        facingMode: "user",
      },
    };
  }

  webgazer.saveDataAcrossSessions?.(Boolean(options.persistCalibration));
  webgazer.showVideoPreview?.(showDebugPreview);
  webgazer.showVideo?.(showDebugPreview);
  webgazer.showFaceOverlay?.(showDebugPreview);
  webgazer.showFaceFeedbackBox?.(showDebugPreview);
  webgazer.showPredictionPoints?.(Boolean(options.debug));
}

function toGazePoint(prediction: { x: number; y: number }): GazePoint | null {
  if (!Number.isFinite(prediction.x) || !Number.isFinite(prediction.y) || typeof window === "undefined") {
    return null;
  }

  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const viewportX = clamp(prediction.x, 0, width);
  const viewportY = clamp(prediction.y, 0, height);

  return {
    viewportX,
    viewportY,
    normalizedX: viewportX / width,
    normalizedY: viewportY / height,
    confidence: 0.65,
    timestamp: performance.now(),
    source: "webgazer",
    raw: prediction,
  };
}

function isPermissionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /permission|denied|notallowed/i.test(`${error.name} ${error.message}`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
