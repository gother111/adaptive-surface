export interface RollingTelemetrySnapshot {
  deliveredCameraFps: number | null;
  latestCameraFrameAgeMs: number | null;
  activeCameraConsumers: readonly string[];
  handFramesConsidered: number;
  handFramesDroppedBusy: number;
  handInferenceP50Ms: number | null;
  handInferenceP95Ms: number | null;
  gazeObservationAgeMs: number | null;
  handObservationAgeMs: number | null;
  outOfOrderGazeDropped: number;
  targetDwellMs: number | null;
  armedTargetId: string | null;
  lastGesture: string | null;
  lastIntent: string | null;
  lastCancellationReason: string | null;
  workerStatus: string;
}

export class PerceptionTelemetry {
  private cameraFrameTimes: number[] = [];
  private handInferenceDurations: number[] = [];
  private snapshot: RollingTelemetrySnapshot = {
    deliveredCameraFps: null,
    latestCameraFrameAgeMs: null,
    activeCameraConsumers: [],
    handFramesConsidered: 0,
    handFramesDroppedBusy: 0,
    handInferenceP50Ms: null,
    handInferenceP95Ms: null,
    gazeObservationAgeMs: null,
    handObservationAgeMs: null,
    outOfOrderGazeDropped: 0,
    targetDwellMs: null,
    armedTargetId: null,
    lastGesture: null,
    lastIntent: null,
    lastCancellationReason: null,
    workerStatus: "idle",
  };

  getSnapshot() {
    return this.snapshot;
  }

  setCameraConsumers(activeCameraConsumers: readonly string[]) {
    this.snapshot = { ...this.snapshot, activeCameraConsumers };
  }

  recordCameraFrame(at: number, now = readNow()) {
    this.cameraFrameTimes.push(at);
    this.cameraFrameTimes = this.cameraFrameTimes.filter((time) => at - time <= 1000);
    this.snapshot = {
      ...this.snapshot,
      deliveredCameraFps: this.cameraFrameTimes.length,
      latestCameraFrameAgeMs: now - at,
    };
  }

  recordHandFrame({ droppedBusy }: { droppedBusy?: boolean } = {}) {
    this.snapshot = {
      ...this.snapshot,
      handFramesConsidered: this.snapshot.handFramesConsidered + 1,
      handFramesDroppedBusy: this.snapshot.handFramesDroppedBusy + (droppedBusy ? 1 : 0),
    };
  }

  recordHandInference(durationMs: number) {
    this.handInferenceDurations.push(durationMs);
    this.handInferenceDurations = this.handInferenceDurations.slice(-80);
    this.snapshot = {
      ...this.snapshot,
      handInferenceP50Ms: percentile(this.handInferenceDurations, 0.5),
      handInferenceP95Ms: percentile(this.handInferenceDurations, 0.95),
    };
  }

  recordGazeObservationAge(ageMs: number) {
    this.snapshot = { ...this.snapshot, gazeObservationAgeMs: ageMs };
  }

  recordHandObservationAge(ageMs: number) {
    this.snapshot = { ...this.snapshot, handObservationAgeMs: ageMs };
  }

  incrementOutOfOrderGazeDropped() {
    this.snapshot = { ...this.snapshot, outOfOrderGazeDropped: this.snapshot.outOfOrderGazeDropped + 1 };
  }

  setTargetDwell(targetDwellMs: number | null) {
    this.snapshot = { ...this.snapshot, targetDwellMs };
  }

  setArmedTarget(armedTargetId: string | null) {
    this.snapshot = { ...this.snapshot, armedTargetId };
  }

  setLastGesture(lastGesture: string | null) {
    this.snapshot = { ...this.snapshot, lastGesture };
  }

  setLastIntent(lastIntent: string | null, cancellationReason: string | null = null) {
    this.snapshot = { ...this.snapshot, lastIntent, lastCancellationReason: cancellationReason };
  }

  setWorkerStatus(workerStatus: string) {
    this.snapshot = { ...this.snapshot, workerStatus };
  }
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? null;
}

function readNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
