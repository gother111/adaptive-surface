import type { CameraSnapshot } from "@/perception/camera/types";
import type { GestureEvent, HandObservation, HandTrackingStatus } from "@/perception/hand/types";
import type { MultimodalIntent, FrozenGazeTarget } from "@/perception/fusion/types";
import type { RollingTelemetrySnapshot } from "@/perception/telemetry";

export interface PerceptionSnapshot {
  handGesturesEnabled: boolean;
  handStatus: HandTrackingStatus;
  handError: string | null;
  camera: CameraSnapshot;
  latestHandObservation: HandObservation | null;
  lastGesture: GestureEvent | null;
  lastIntent: MultimodalIntent | null;
  armedTarget: FrozenGazeTarget | null;
  telemetry: RollingTelemetrySnapshot;
}
