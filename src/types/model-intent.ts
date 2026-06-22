import type { ObjectiveKind, ObjectiveRouteKind } from "@/objectives/objective-types";
import type { SurfaceKind } from "@/types/surface";

export type ModelProviderStatusKind = "ready" | "not_configured" | "unavailable";

export interface ModelProviderStatus {
  provider: "deepseek-v4-flash";
  model: string;
  baseUrl: string;
  configured: boolean;
  status: ModelProviderStatusKind;
  keySource: string | null;
  message: string;
}

export interface ModelIntentRefineRequest {
  transcript: string;
  localIntentTitle?: string | null;
  localIntentKind?: string | null;
  activeObjectiveKind?: ObjectiveKind | null;
  activeSurfaceKind?: SurfaceKind | string | null;
  selectedModel?: string | null;
}

export type ModelIntentRefinementStatus =
  | "used"
  | "not_configured"
  | "unavailable"
  | "invalid_response";

export interface ModelIntentRefinement {
  status: ModelIntentRefinementStatus;
  provider: "deepseek-v4-flash";
  model: string;
  routedUtterance: string | null;
  objectiveKind: ObjectiveKind | "unknown";
  route: ObjectiveRouteKind | "unknown";
  confidence: number;
  reason: string;
  latencyMs: number | null;
  warnings: string[];
}

export interface ModelRoutingState {
  enabled: boolean;
  phase: "idle" | "checking" | "routing" | "used" | "fallback" | "error";
  requestId: string | null;
  providerStatus: ModelProviderStatus;
  lastRefinement: ModelIntentRefinement | null;
  lastError: string | null;
}
