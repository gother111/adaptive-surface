import { attachObjectsToObjectiveFrame } from "@/objectives/objective-reducer";
import type { ObjectiveFrame } from "@/objectives/objective-types";
import { explainObjectRelevance, scoreObjectRelevanceToObjective } from "@/work-pipeline/classify-work-context";
import type { ConnectContextResult } from "@/work-pipeline/pipeline-types";
import type { WorkObject } from "@/work-objects/work-object-types";

export function connectContextToObjective(
  objective: ObjectiveFrame,
  objects: WorkObject[],
  minimumScore = 0.3,
): ConnectContextResult {
  const relevantObjects = objects
    .map((object) => ({
      object,
      relevance: scoreObjectRelevanceToObjective(object, objective),
      reasons: explainObjectRelevance(object, objective),
    }))
    .filter((item) => item.relevance >= minimumScore)
    .sort((left, right) => right.relevance - left.relevance);

  return {
    objective: attachObjectsToObjectiveFrame(objective, relevantObjects.map((item) => item.object.id)),
    relevantObjects,
  };
}
