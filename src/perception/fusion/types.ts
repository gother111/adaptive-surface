import type { GazeTargetMetadata, GazeTargetType, NormalizedRect } from "@/gaze/types";

export interface FrozenGazeTarget {
  id: string;
  type: GazeTargetType;
  metadata?: GazeTargetMetadata;
  rect: NormalizedRect;
  activeSince: number;
  observedAt: number;
}

export type MultimodalIntent =
  | {
      kind: "confirm-target";
      target: FrozenGazeTarget;
      source: "gaze+pinch";
      gestureStartedAt: number;
      committedAt: number;
    }
  | {
      kind: "cancel";
      source: "open-palm" | "tracking-loss" | "timeout" | "target-invalid";
      at: number;
    }
  | {
      kind: "navigate";
      direction: "left" | "right";
      source: "gesture";
      at: number;
    }
  | {
      kind: "drag-target";
      target: FrozenGazeTarget;
      phase: "started" | "updated" | "committed" | "cancelled";
      delta: { x: number; y: number };
      at: number;
    };
