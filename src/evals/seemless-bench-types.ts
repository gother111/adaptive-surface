import type { CapabilityId } from "@/capabilities/capability-types";
import type { ObjectiveKind } from "@/objectives/objective-types";

export type GoldenTask = {
  id: string;
  title: string;
  utterances: string[];
  expected: {
    objectiveKind?: ObjectiveKind;
    primarySurfaceKind?: string;
    supportingSurfaceKinds?: string[];
    shouldPersistSurface?: boolean;
    requiresApproval?: boolean;
    shouldRefreshAppleContext?: boolean;
    forbiddenActions?: CapabilityId[];
  };
};

export interface GoldenTaskResult {
  id: string;
  title: string;
  passed: boolean;
  failures: string[];
}

export interface GoldenEvalReport {
  taskCount: number;
  passCount: number;
  failCount: number;
  metrics: {
    objectiveRoutingAccuracy: number;
    surfacePersistenceRate: number;
    correctSupportingSurfaceRate: number;
    approvalSafetyRate: number;
    contextRefreshCorrectness: number;
    unknownFallbackRate: number;
  };
  results: GoldenTaskResult[];
}
