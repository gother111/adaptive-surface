import { FramePump } from "@/perception/camera/FramePump";
import { sharedWebcamSource } from "@/perception/camera/SharedWebcamSource";
import type { CameraFrameSource, CameraLease, FrameEnvelope } from "@/perception/camera/types";
import { FrameInferenceScheduler } from "@/perception/hand/FrameInferenceScheduler";
import { GestureRecognizer } from "@/perception/hand/GestureRecognizer";
import { HandTrackingWorkerClient, type HandTrackingWorkerClientOptions } from "@/perception/hand/HandTrackingWorker";
import type { GestureEvent, HandObservation, HandTrackingStatus } from "@/perception/hand/types";

interface HandTrackingProviderOptions {
  camera?: CameraFrameSource;
  worker?: HandTrackingWorkerClient;
  workerOptions?: HandTrackingWorkerClientOptions;
  createImageBitmap?: (source: HTMLVideoElement) => Promise<ImageBitmap>;
}

export class HandTrackingProvider {
  private status: HandTrackingStatus = "idle";
  private lease: CameraLease | null = null;
  private pump: FramePump | null = null;
  private unsubscribePump: (() => void) | null = null;
  private worker: HandTrackingWorkerClient | null = null;
  private scheduler: FrameInferenceScheduler | null = null;
  private recognizer = new GestureRecognizer();
  private observations = new Set<(observation: HandObservation) => void>();
  private gestures = new Set<(gesture: GestureEvent) => void>();
  private statusListeners = new Set<(status: HandTrackingStatus) => void>();
  private error: string | null = null;

  constructor(private options: HandTrackingProviderOptions = {}) {}

  getStatus() {
    return this.status;
  }

  getLastError() {
    return this.error;
  }

  async start() {
    if (this.status === "active" || this.status === "starting" || this.status === "loading-model") return;
    if (typeof Worker === "undefined" && !this.options.worker && !this.options.workerOptions?.workerFactory) {
      this.setStatus("unsupported");
      this.error = "Web Workers are unavailable in this runtime.";
      return;
    }

    this.error = null;
    this.setStatus("starting");

    try {
      const camera = this.options.camera ?? sharedWebcamSource;
      this.lease = await camera.acquire("hand-tracking");
      this.worker = this.options.worker ?? new HandTrackingWorkerClient(this.options.workerOptions);
      this.worker.subscribe((observation) => this.receiveObservation(observation));
      this.worker.onError((message) => this.fail(message));
      this.setStatus("loading-model");
      await this.worker.start();

      this.scheduler = new FrameInferenceScheduler((frame) => this.captureAndDetect(frame), { targetFps: 15 });
      this.pump = new FramePump(this.lease.video);
      this.unsubscribePump = this.pump.subscribe((frame) => {
        camera.setLatestFrameAt?.(frame.capturedAt);
        this.scheduler?.consider(frame);
      });
      this.setStatus("active");
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      await this.stop();
      this.setStatus("error");
    }
  }

  async stop() {
    this.unsubscribePump?.();
    this.unsubscribePump = null;
    this.scheduler?.cancel();
    this.scheduler = null;
    this.pump?.stop();
    this.pump = null;
    this.worker?.stop();
    this.worker = null;
    this.recognizer.reset();
    await this.lease?.release();
    this.lease = null;
    this.setStatus("idle");
  }

  subscribe(listener: (observation: HandObservation) => void) {
    this.observations.add(listener);
    return () => this.observations.delete(listener);
  }

  subscribeGesture(listener: (gesture: GestureEvent) => void) {
    this.gestures.add(listener);
    return () => this.gestures.delete(listener);
  }

  onStatusChange(listener: (status: HandTrackingStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private async captureAndDetect(frame: FrameEnvelope) {
    const video = this.lease?.video;
    const worker = this.worker;
    if (!video || !worker?.isReady()) return;

    const createBitmap = this.options.createImageBitmap ?? (globalThis.createImageBitmap?.bind(globalThis));
    if (!createBitmap) {
      this.fail("createImageBitmap is unavailable in this runtime.");
      return;
    }

    const bitmap = await createBitmap(video);
    const sent = worker.detect(bitmap, frame);
    if (!sent) {
      bitmap.close?.();
    }
  }

  private receiveObservation(observation: HandObservation) {
    this.observations.forEach((listener) => listener(observation));
    for (const gesture of this.recognizer.ingest(observation)) {
      this.gestures.forEach((listener) => listener(gesture));
    }
  }

  private fail(message: string) {
    this.error = message;
    this.setStatus("error");
  }

  private setStatus(status: HandTrackingStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}
