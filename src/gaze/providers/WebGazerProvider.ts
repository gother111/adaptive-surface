import { initialCalibration } from "@/gaze/config";
import { ProviderEvents } from "@/gaze/providers/ProviderEvents";
import { sharedWebcamSource, type CameraFrameSource, type CameraLease } from "@/perception/camera";
import type {
  GazeCalibrationOptions,
  GazeCalibrationSample,
  GazeCalibrationState,
  GazeInputProvider,
  GazeObservation,
  GazeProviderStatus,
  GazeStartOptions,
  NormalizedRect,
} from "@/gaze/types";

type WebGazerLike = {
  params?: {
    faceMeshSolutionPath?: string;
    camConstraints?: MediaStreamConstraints;
    applyKalmanFilter?: boolean;
  };
  setStaticVideo?: (stream: MediaStream) => WebGazerLike;
  setGazeListener?: (listener: (data: WebGazerPrediction | null, elapsedTime: number) => void) => WebGazerLike;
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
  applyKalmanFilter?: (enabled: boolean) => WebGazerLike;
  removeMouseEventListeners?: () => WebGazerLike;
  recordScreenPosition?: (x: number, y: number, eventType?: "click" | "move") => WebGazerLike;
  clearData?: () => WebGazerLike | void;
};

interface WebGazerPrediction {
  x: number;
  y: number;
  eyeFeatures?: {
    left?: { imagex?: number; imagey?: number; width?: number; height?: number };
    right?: { imagex?: number; imagey?: number; width?: number; height?: number };
  };
}

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
  private lease: CameraLease | null = null;
  private sequence = 0;

  constructor(private camera: CameraFrameSource = sharedWebcamSource) {}

  getStatus() {
    return this.status;
  }

  async start(options: GazeStartOptions = {}) {
    if (typeof window === "undefined") {
      this.setStatus("unsupported");
      return;
    }

    this.setStatus("starting");
    const webgazer = await loadWebGazer();
    if (!webgazer?.setGazeListener || !webgazer.begin || !webgazer.setStaticVideo) {
      this.setStatus("unsupported");
      return;
    }

    this.webgazer = webgazer;

    try {
      this.lease = await this.camera.acquire("webgazer");
      configureWebGazer(webgazer, options);
      webgazer.setStaticVideo(this.lease.stream);
      webgazer.setGazeListener?.((prediction) => {
        this.events.emitPoint(toObservation(prediction, ++this.sequence, this.camera.getSnapshot().latestFrameAt));
      });
      await webgazer.begin();
      webgazer.removeMouseEventListeners?.();
      this.setStatus("active");
    } catch (error) {
      await this.cleanupWebGazer();
      await this.releaseLease();
      this.webgazer = null;
      this.setStatus(isPermissionError(error) ? "permission-denied" : "error");
    }
  }

  async stop() {
    try {
      await this.cleanupWebGazer();
      await this.releaseLease();
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
      phase: this.webgazer ? "complete" : "failed",
      status: this.webgazer ? "complete" : "failed",
      sampleCount: options.pointCount ?? 9,
      quality: this.webgazer ? "fair" : "unknown",
      completedAt: this.webgazer ? performance.now() : undefined,
    };
  }

  recordCalibrationSample(sample: GazeCalibrationSample) {
    if (!this.webgazer?.recordScreenPosition) return;

    this.webgazer.recordScreenPosition(sample.targetX, sample.targetY, "click");
  }

  async clearCalibration() {
    this.webgazer?.clearData?.();
  }

  subscribe(listener: (observation: GazeObservation) => void) {
    return this.events.subscribe(listener);
  }

  onStatusChange(listener: (status: GazeProviderStatus) => void) {
    return this.events.onStatusChange(listener);
  }

  private setStatus(status: GazeProviderStatus) {
    this.status = status;
    this.events.emitStatus(status);
  }

  private async cleanupWebGazer() {
    this.webgazer?.clearGazeListener?.();
    this.webgazer?.removeMouseEventListeners?.();
    try {
      await this.webgazer?.end?.();
    } catch {
      // WebGazer can throw if startup failed before its preview container exists.
    }
  }

  private async releaseLease() {
    await this.lease?.release();
    this.lease = null;
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
    webgazer.params.applyKalmanFilter = false;
  }

  webgazer.applyKalmanFilter?.(false);
  webgazer.saveDataAcrossSessions?.(Boolean(options.persistCalibration));
  webgazer.showVideoPreview?.(showDebugPreview);
  webgazer.showVideo?.(showDebugPreview);
  webgazer.showFaceOverlay?.(showDebugPreview);
  webgazer.showFaceFeedbackBox?.(showDebugPreview);
  webgazer.showPredictionPoints?.(Boolean(options.debug));
}

function toObservation(
  prediction: WebGazerPrediction | null,
  sequence: number,
  capturedAt: number | null,
): GazeObservation {
  const emittedAt = performance.now();
  if (!prediction || !Number.isFinite(prediction.x) || !Number.isFinite(prediction.y) || typeof window === "undefined") {
    return {
      sequence,
      capturedAt,
      emittedAt,
      point: null,
      confidence: null,
      trackingState: prediction ? "degraded" : "lost",
      facePresent: null,
      eyesOpen: null,
      source: "webgazer",
      debug: { provider: "webgazer", reason: prediction ? "invalid-prediction" : "no-prediction" },
    };
  }

  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const viewportX = clamp(prediction.x, 0, width);
  const viewportY = clamp(prediction.y, 0, height);

  return {
    sequence,
    capturedAt,
    emittedAt,
    point: {
      viewportX,
      viewportY,
      normalizedX: viewportX / width,
      normalizedY: viewportY / height,
    },
    confidence: null,
    trackingState: "usable",
    facePresent: null,
    eyesOpen: null,
    eyeRegion: sanitizeEyeRegion(prediction),
    source: "webgazer",
    debug: { provider: "webgazer" },
  };
}

function sanitizeEyeRegion(prediction: WebGazerPrediction): NormalizedRect | undefined {
  const left = prediction.eyeFeatures?.left;
  const right = prediction.eyeFeatures?.right;
  if (!left || !right) return undefined;
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const minX = Math.min(left.imagex ?? 0, right.imagex ?? 0);
  const minY = Math.min(left.imagey ?? 0, right.imagey ?? 0);
  const maxX = Math.max((left.imagex ?? 0) + (left.width ?? 0), (right.imagex ?? 0) + (right.width ?? 0));
  const maxY = Math.max((left.imagey ?? 0) + (left.height ?? 0), (right.imagey ?? 0) + (right.height ?? 0));
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return undefined;
  return {
    x: clamp(minX / width, 0, 1),
    y: clamp(minY / height, 0, 1),
    width: clamp((maxX - minX) / width, 0, 1),
    height: clamp((maxY - minY) / height, 0, 1),
  };
}

function isPermissionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /permission|denied|notallowed/i.test(`${error.name} ${error.message}`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
