import type { FrameEnvelope } from "@/perception/camera/types";
import type { NormalizedRect } from "@/gaze/types";

export type HandTrackingStatus = "idle" | "starting" | "loading-model" | "active" | "unsupported" | "error";
export type Handedness = "left" | "right" | "unknown";

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandObservation {
  sequence: number;
  capturedAt: number;
  emittedAt: number;
  handPresent: boolean;
  handedness: Handedness;
  trackingConfidence: number | null;
  boundingBox: NormalizedRect | null;
  landmarks?: readonly NormalizedLandmark[];
}

export type GestureKind = "pinch" | "open-palm" | "swipe-left" | "swipe-right" | "pinch-drag";
export type GesturePhase = "started" | "updated" | "committed" | "cancelled";

export interface GestureEvent {
  kind: GestureKind;
  phase: GesturePhase;
  startedAt: number;
  updatedAt: number;
  committedAt?: number;
  cancelledAt?: number;
  centroid: { x: number; y: number } | null;
  delta: { x: number; y: number };
  reason?: string;
}

export type HandWorkerRequest =
  | {
      type: "init";
      wasmBaseUrl: string;
      modelAssetPath: string;
      numHands: number;
    }
  | {
      type: "detect";
      frame: ImageBitmap;
      envelope: FrameEnvelope;
    }
  | { type: "shutdown" };

export type HandWorkerResponse =
  | { type: "ready" }
  | { type: "observation"; observation: HandObservation }
  | { type: "error"; message: string; recoverable: boolean };
