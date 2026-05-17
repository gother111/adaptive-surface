import type { ObjectiveFrame } from "@/objectives/objective-types";

export function getActiveObjective(objectives: ObjectiveFrame[], activeObjectiveId: string | null) {
  return objectives.find((objective) => objective.id === activeObjectiveId) ?? null;
}

export function findObjectiveByKind(objectives: ObjectiveFrame[], kind: ObjectiveFrame["kind"]) {
  return objectives
    .filter((objective) => objective.kind === kind)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

export function serializeObjectiveMemory(objectives: ObjectiveFrame[]) {
  return objectives
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12)
    .map((objective) => ({
      id: objective.id,
      kind: objective.kind,
      status: objective.status,
      title: objective.title,
      activeObjectIds: objective.activeObjectIds,
      updatedAt: objective.updatedAt,
    }));
}
