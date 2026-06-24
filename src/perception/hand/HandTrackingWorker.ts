import type { FrameEnvelope } from "@/perception/camera/types";
import type { HandObservation, HandWorkerRequest, HandWorkerResponse } from "@/perception/hand/types";

export interface HandTrackingWorkerClientOptions {
  workerFactory?: () => Worker;
  wasmBaseUrl?: string;
  modelAssetPath?: string;
  numHands?: number;
}

export class HandTrackingWorkerClient {
  private worker: Worker | null = null;
  private ready = false;
  private listeners = new Set<(observation: HandObservation) => void>();
  private errorListeners = new Set<(message: string) => void>();

  constructor(private options: HandTrackingWorkerClientOptions = {}) {}

  async start() {
    if (typeof Worker === "undefined" && !this.options.workerFactory) {
      throw new Error("Web Workers are unavailable in this runtime.");
    }

    this.worker = this.options.workerFactory?.() ?? new Worker(new URL("./hand-tracking.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<HandWorkerResponse>) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      this.errorListeners.forEach((listener) => listener(event.message || "Hand worker crashed."));
    };
    this.post({
      type: "init",
      wasmBaseUrl: this.options.wasmBaseUrl ?? "/vendor/mediapipe-tasks-vision/wasm",
      modelAssetPath: this.options.modelAssetPath ?? "/models/hand-landmarker/hand_landmarker.task",
      numHands: this.options.numHands ?? 1,
    });
  }

  detect(frame: ImageBitmap, envelope: FrameEnvelope) {
    if (!this.worker || !this.ready) {
      frame.close?.();
      return false;
    }

    this.worker.postMessage({ type: "detect", frame, envelope } satisfies HandWorkerRequest, [frame]);
    return true;
  }

  stop() {
    this.post({ type: "shutdown" });
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  subscribe(listener: (observation: HandObservation) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onError(listener: (message: string) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  isReady() {
    return this.ready;
  }

  private handleMessage(response: HandWorkerResponse) {
    if (response.type === "ready") {
      this.ready = true;
      return;
    }

    if (response.type === "observation") {
      this.listeners.forEach((listener) => listener(response.observation));
      return;
    }

    this.errorListeners.forEach((listener) => listener(response.message));
  }

  private post(message: HandWorkerRequest) {
    this.worker?.postMessage(message);
  }
}
