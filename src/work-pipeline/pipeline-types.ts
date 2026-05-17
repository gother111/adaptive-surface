import type { ObjectiveFrame } from "@/objectives/objective-types";
import type { WorkObject } from "@/work-objects/work-object-types";

export interface WorkContextClassification {
  object: WorkObject;
  relevance: number;
  reasons: string[];
}

export interface ConnectContextResult {
  objective: ObjectiveFrame;
  relevantObjects: WorkContextClassification[];
}
