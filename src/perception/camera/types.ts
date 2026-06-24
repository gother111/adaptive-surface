export type CameraStatus =
  | "idle"
  | "starting"
  | "active"
  | "permission-denied"
  | "unsupported"
  | "ended"
  | "error";

export interface CameraSnapshot {
  status: CameraStatus;
  activeConsumerIds: readonly string[];
  width: number | null;
  height: number | null;
  frameRate: number | null;
  deviceId: string | null;
  latestFrameAt: number | null;
  lastError: string | null;
}

export interface CameraLease {
  readonly consumerId: string;
  readonly stream: MediaStream;
  readonly video: HTMLVideoElement;
  release(): Promise<void>;
}

export interface CameraFrameSource {
  acquire(consumerId: string): Promise<CameraLease>;
  getSnapshot(): CameraSnapshot;
  subscribe(listener: (snapshot: CameraSnapshot) => void): () => void;
  stopAll(): Promise<void>;
  setLatestFrameAt?(capturedAt: number): void;
}

export interface FrameEnvelope {
  sequence: number;
  capturedAt: number;
  width: number;
  height: number;
  mirrored: false;
}
