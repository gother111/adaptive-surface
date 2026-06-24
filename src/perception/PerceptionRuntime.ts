import { sharedWebcamSource } from "@/perception/camera/SharedWebcamSource";
import { MultimodalIntentArbiter } from "@/perception/fusion/MultimodalIntentArbiter";
import { HandTrackingProvider } from "@/perception/hand/HandTrackingProvider";
import { PerceptionTelemetry } from "@/perception/telemetry";
import type { GazeSnapshot } from "@/gaze/types";
import type { GestureEvent, HandObservation, HandTrackingStatus } from "@/perception/hand/types";
import type { MultimodalIntent } from "@/perception/fusion/types";
import type { PerceptionSnapshot } from "@/perception/types";

export class PerceptionRuntime {
  private handProvider = new HandTrackingProvider();
  private arbiter = new MultimodalIntentArbiter();
  private telemetry = new PerceptionTelemetry();
  private listeners = new Set<(snapshot: PerceptionSnapshot) => void>();
  private latestGazeSnapshot: GazeSnapshot | null = null;
  private handGesturesEnabled = false;
  private handStatus: HandTrackingStatus = "idle";
  private handError: string | null = null;
  private latestHandObservation: HandObservation | null = null;
  private lastGesture: GestureEvent | null = null;
  private lastIntent: MultimodalIntent | null = null;

  constructor() {
    sharedWebcamSource.subscribe((snapshot) => {
      this.telemetry.setCameraConsumers(snapshot.activeConsumerIds);
      if (snapshot.latestFrameAt !== null) this.telemetry.recordCameraFrame(snapshot.latestFrameAt);
      this.emit();
    });
    this.handProvider.onStatusChange((status) => {
      this.handStatus = status;
      this.handError = this.handProvider.getLastError();
      this.telemetry.setWorkerStatus(status);
      this.emit();
    });
    this.handProvider.subscribe((observation) => {
      this.latestHandObservation = observation;
      this.telemetry.recordHandObservationAge(readNow() - observation.capturedAt);
      this.arbiter.ingestHand(observation);
      this.emit();
    });
    this.handProvider.subscribeGesture((gesture) => {
      this.lastGesture = gesture;
      this.telemetry.setLastGesture(`${gesture.kind}:${gesture.phase}`);
      this.handleIntent(this.arbiter.ingestGesture(gesture));
      this.emit();
    });
  }

  getSnapshot(): PerceptionSnapshot {
    return {
      handGesturesEnabled: this.handGesturesEnabled,
      handStatus: this.handStatus,
      handError: this.handError,
      camera: sharedWebcamSource.getSnapshot(),
      latestHandObservation: this.latestHandObservation,
      lastGesture: this.lastGesture,
      lastIntent: this.lastIntent,
      armedTarget: this.arbiter.getArmedTarget(),
      telemetry: this.telemetry.getSnapshot(),
    };
  }

  subscribe(listener: (snapshot: PerceptionSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async setHandGesturesEnabled(enabled: boolean) {
    this.handGesturesEnabled = enabled;
    if (!enabled) {
      await this.stopHandTracking();
      this.handleIntent(this.arbiter.cancel("timeout"));
      this.emit();
      return;
    }

    if (this.latestGazeSnapshot?.status === "active" || this.latestGazeSnapshot?.providerId === "off") {
      await this.startHandTracking();
    }
    this.emit();
  }

  async startHandTracking() {
    if (!this.handGesturesEnabled) return;
    await this.handProvider.start();
  }

  async stopHandTracking() {
    await this.handProvider.stop();
  }

  setGazeSnapshot(snapshot: GazeSnapshot) {
    this.latestGazeSnapshot = snapshot;
    this.telemetry.recordGazeObservationAge(snapshot.latestObservation?.capturedAt ? readNow() - snapshot.latestObservation.capturedAt : 0);
    this.telemetry.setTargetDwell(snapshot.currentTarget?.dwellMs ?? null);
    this.handleIntent(this.arbiter.ingestGaze({
      target: snapshot.currentTarget,
      observation: snapshot.latestObservation,
      calibration: snapshot.calibration,
      targetStillRegistered: (targetId) => snapshot.currentTarget?.id === targetId,
    }));
    this.telemetry.setArmedTarget(this.arbiter.getArmedTarget()?.id ?? null);
    this.emit();
  }

  cancel(reason: "open-palm" | "tracking-loss" | "timeout" | "target-invalid" = "timeout") {
    this.handleIntent(this.arbiter.cancel(reason));
    this.emit();
  }

  private handleIntent(intent: MultimodalIntent | null) {
    if (!intent) return;
    this.lastIntent = intent;
    this.telemetry.setLastIntent(intent.kind, intent.kind === "cancel" ? intent.source : null);
    this.telemetry.setArmedTarget(this.arbiter.getArmedTarget()?.id ?? null);
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const perceptionRuntime = new PerceptionRuntime();

function readNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
