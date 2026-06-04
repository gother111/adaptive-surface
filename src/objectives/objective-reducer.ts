import { createContextRequirements, createPlannedActions, getObjectiveDefinition } from "@/objectives/objective-registry";
import type { ObjectiveFrame, ObjectiveRoutingDecision } from "@/objectives/objective-types";

export function createObjectiveFrame(userGoal: string, decision: ObjectiveRoutingDecision, now = Date.now()): ObjectiveFrame {
  const definition = getObjectiveDefinition(decision.objectiveKind);

  return {
    id: `obj_${now}_${Math.random().toString(36).slice(2, 8)}`,
    kind: decision.objectiveKind,
    status: decision.route === "request_approval" ? "needs_approval" : "active",
    title: definition.title,
    userGoal,
    activeObjectIds: [],
    requiredContext: decision.requestedContext.length
      ? decision.requestedContext
      : createContextRequirements(decision.objectiveKind, "Initial objective context."),
    plannedActions: createPlannedActions(decision.objectiveKind),
    completedActions: [],
    utterances: [utteranceFromDecision(userGoal, decision, now)],
    slots: extractSlots(userGoal),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyObjectiveRouting(
  objectives: ObjectiveFrame[],
  activeObjectiveId: string | null,
  decision: ObjectiveRoutingDecision,
  utterance: string,
  now = Date.now(),
): { objectives: ObjectiveFrame[]; activeObjectiveId: string | null; objectiveHistory: string[] } {
  if (decision.route === "switch_to_previous_objective" && decision.targetObjectiveId) {
    return {
      objectives: objectives.map((objective) =>
        objective.id === decision.targetObjectiveId
          ? { ...objective, status: "active", updatedAt: now, utterances: [utteranceFromDecision(utterance, decision, now), ...objective.utterances] }
          : objective.id === activeObjectiveId && objective.status === "active"
            ? { ...objective, status: "paused", updatedAt: now }
            : objective,
      ),
      activeObjectiveId: decision.targetObjectiveId,
      objectiveHistory: [decision.targetObjectiveId, activeObjectiveId, ...objectives.map((item) => item.id)]
        .filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index)
        .slice(0, 12),
    };
  }

  if (decision.route === "create_new_objective" || (!activeObjectiveId && decision.route === "unknown")) {
    const objective = createObjectiveFrame(utterance, decision, now);
    return {
      objectives: [...objectives, objective],
      activeObjectiveId: objective.id,
      objectiveHistory: [objective.id, ...objectives.map((item) => item.id)].slice(0, 12),
    };
  }

  if (!activeObjectiveId) {
    return {
      objectives,
      activeObjectiveId: null,
      objectiveHistory: objectives.map((item) => item.id).slice(0, 12),
    };
  }

  const targetId = decision.targetObjectiveId ?? activeObjectiveId;
  return {
    objectives: objectives.map((objective) =>
      objective.id === targetId ? updateObjective(objective, decision, utterance, now) : objective,
    ),
    activeObjectiveId: decision.route === "complete_objective" ? null : targetId,
    objectiveHistory: [targetId, ...objectives.map((item) => item.id)]
      .filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index)
      .slice(0, 12),
  };
}

export function attachObjectsToObjectiveFrame(objective: ObjectiveFrame, objectIds: string[], now = Date.now()): ObjectiveFrame {
  const activeObjectIds = Array.from(new Set([...objective.activeObjectIds, ...objectIds]));

  return {
    ...objective,
    activeObjectIds,
    requiredContext: objective.requiredContext.map((requirement) =>
      objectIds.length ? { ...requirement, status: "available" } : requirement,
    ),
    updatedAt: now,
  };
}

function updateObjective(objective: ObjectiveFrame, decision: ObjectiveRoutingDecision, utterance: string, now: number): ObjectiveFrame {
  const requiredContext = mergeContextRequirements(objective.requiredContext, decision.requestedContext);
  const status = decision.route === "complete_objective"
    ? "completed"
    : decision.route === "request_approval"
      ? "needs_approval"
      : requiredContext.some((context) => context.status === "missing") && decision.route === "add_supporting_context"
        ? "waiting_for_context"
        : "active";

  return {
    ...objective,
    status,
    userGoal: decision.route === "refine_current_objective" || decision.route === "continue_current_objective"
      ? `${objective.userGoal}\n${utterance}`.trim()
      : objective.userGoal,
    requiredContext,
    utterances: [utteranceFromDecision(utterance, decision, now), ...objective.utterances].slice(0, 40),
    slots: { ...objective.slots, ...extractSlots(utterance) },
    updatedAt: now,
  };
}

function mergeContextRequirements(current: ObjectiveFrame["requiredContext"], next: ObjectiveFrame["requiredContext"]) {
  const byId = new Map(current.map((requirement) => [requirement.id, requirement]));
  for (const requirement of next) {
    byId.set(requirement.id, byId.get(requirement.id) ?? requirement);
  }
  return Array.from(byId.values());
}

function utteranceFromDecision(text: string, decision: ObjectiveRoutingDecision, now: number) {
  return {
    id: `utt_${now}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    createdAt: now,
    route: decision.route,
  };
}

function extractSlots(text: string) {
  const slots: Record<string, unknown> = {};
  const recipient = text.match(/\b(?:to|for|with)\s+([A-Z][a-z]+|[a-z]+)/)?.[1];
  if (recipient) slots.person = `${recipient.charAt(0).toUpperCase()}${recipient.slice(1).toLowerCase()}`;
  if (/\btomorrow\b/i.test(text)) slots.dateScope = "tomorrow";
  if (/\bnext tuesday\b/i.test(text)) slots.dateScope = "next_tuesday";
  if (/\b10\b/.test(text)) slots.timeHint = "10";
  return slots;
}
