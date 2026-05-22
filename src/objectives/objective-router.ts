import { createContextRequirements } from "@/objectives/objective-registry";
import type { ObjectiveFrame, ObjectiveKind, ObjectiveRoutingDecision } from "@/objectives/objective-types";

const CONTINUATION_RE = /\b(also|mention|add|include|use (the|my) calendar|check notes|don't send yet|dont send yet|keep .* open|continue)\b/;
const REFINEMENT_RE = /\b(make it|make this|shorter|warmer|more formal|friendlier|clearer|more concise)\b/;
const SWITCH_RE = /\b(new task|start over|switch to|go back to|close this|forget this|open calendar instead)\b/;
const COMPLETE_RE = /\b(done|complete|finish|close this|forget this)\b/;
const APPROVAL_RE = /\b(send it|send this|approve|yes send|create event|create reminder)\b/;
const APPROVAL_NEGATION_RE = /\b(approve nothing|approve none|approve no|approve only if|do not approve|don't approve|do not send|don't send|dont send)\b/;

export function routeUtteranceToObjectiveFrame(
  utterance: string,
  activeObjective: ObjectiveFrame | null,
  objectives: ObjectiveFrame[],
): ObjectiveRoutingDecision {
  const text = normalize(utterance);
  const explicitKind = classifyObjectiveKind(text);
  const previousObjective = findPreviousObjective(text, activeObjective, objectives);

  if (APPROVAL_RE.test(text) && !APPROVAL_NEGATION_RE.test(text)) {
    return decision("request_approval", activeObjective?.kind ?? explicitKind, "User requested an approval-gated action.", 0.88, activeObjective?.id);
  }

  if (previousObjective) {
    return decision("switch_to_previous_objective", previousObjective.kind, "User explicitly asked to return to a previous objective.", 0.92, previousObjective.id);
  }

  if (COMPLETE_RE.test(text) && activeObjective) {
    return decision("complete_objective", activeObjective.kind, "User explicitly completed or closed the objective.", 0.9, activeObjective.id);
  }

  if (SWITCH_RE.test(text) && explicitKind !== "unknown") {
    return decision("create_new_objective", explicitKind, "User explicitly switched to a new task.", 0.86);
  }

  if (activeObjective && REFINEMENT_RE.test(text)) {
    return decision("refine_current_objective", activeObjective.kind, "User refined the active objective.", 0.91, activeObjective.id);
  }

  if (activeObjective && CONTINUATION_RE.test(text)) {
    const requestedContext = requestedContextFor(text, activeObjective.kind);
    return {
      ...decision(
        requestedContext.length ? "add_supporting_context" : "continue_current_objective",
        activeObjective.kind,
        requestedContext.length ? "User added supporting context to the active objective." : "User continued the active objective.",
        0.89,
        activeObjective.id,
      ),
      requestedContext,
    };
  }

  if (activeObjective && explicitKind !== "unknown" && shouldSupportActiveObjective(activeObjective.kind, explicitKind, text)) {
    return {
      ...decision("add_supporting_context", activeObjective.kind, "New request supports the active objective.", 0.78, activeObjective.id),
      requestedContext: createContextRequirements(explicitKind, "Supporting context requested by voice."),
    };
  }

  if (explicitKind !== "unknown") {
    return decision("create_new_objective", explicitKind, "Utterance maps to a new objective.", 0.85);
  }

  if (activeObjective) {
    return decision("continue_current_objective", activeObjective.kind, "No explicit switch, so preserve the active objective.", 0.62, activeObjective.id);
  }

  return decision("unknown", "unknown", "No objective matched.", 0.35);
}

export function classifyObjectiveKind(text: string): ObjectiveKind {
  if (/\b(write|draft|compose|start).*\b(email|mail|message)\b/.test(text)) return "draft_email";
  if (/\b(draft|write|compose).*\breply\b/.test(text)) return "draft_email";
  if (/\b(go back to|return to|keep).*\b(reply|email draft|draft)\b/.test(text)) return "draft_email";
  if (/\b(reply|respond).*\b(email|mail|message)\b/.test(text)) return "reply_to_email";
  if (/\b(summarize|summary).*\b(email|thread|message)\b/.test(text)) return "summarize_email_or_thread";
  if (/\b(show|open|check|look at).*\b(calendar|schedule|events?|meetings?)\b/.test(text)) return "show_calendar";
  if (/\b(schedule|book|create).*\b(meeting|event)\b/.test(text)) return "schedule_meeting";
  if (/\b(prepare).*\b(meeting)\b/.test(text)) return "prepare_meeting";
  if (/\b(find|search|look for).*\b(notes?|apple notes)\b/.test(text)) return "search_notes";
  if (/\b(summarize|summary).*\b(notes?)\b/.test(text)) return "summarize_notes";
  if (/\b(create|add|set).*\b(reminder)\b/.test(text)) return "create_reminder";
  if (/\b(show|open|check).*\b(reminders?)\b/.test(text)) return "show_reminders";
  if (/\b(search|find|look for).*\b(file|folder|directory|pdf|project)\b/.test(text)) return "search_files";
  if (/\b(summarize|summary).*\b(file|pdf|document|this)\b/.test(text)) return "summarize_file";
  if (/\b(analyze).*\b(file|table|spreadsheet|csv|xlsx)\b/.test(text)) return "analyze_file_or_table";
  if (/\b(create|draw|make).*\b(chart|graph)\b/.test(text)) return "create_chart";
  if (/\b(catch me up|catch up|what did i miss)\b/.test(text)) return "catch_up";
  if (/\b(decision brief|brief).*\b(decision|options?)\b/.test(text)) return "create_decision_brief";
  if (/\b(status report|update report)\b/.test(text)) return "create_status_report";
  if (/\b(compare|versus|vs\.?)\b/.test(text)) return "compare_options";
  if (/\b(quick note|note this|write this down)\b/.test(text)) return "quick_note";
  return "unknown";
}

function requestedContextFor(text: string, activeKind: ObjectiveKind) {
  if (/\b(calendar|availability|schedule|events?|meetings?|next tuesday)\b/.test(text)) {
    return createContextRequirements("show_calendar", `${activeKind} needs calendar support.`);
  }

  if (/\b(notes?|apple notes)\b/.test(text)) {
    return createContextRequirements("search_notes", `${activeKind} needs notes support.`);
  }

  if (/\b(mail|email|thread|message)\b/.test(text)) {
    return createContextRequirements("summarize_email_or_thread", `${activeKind} needs mail support.`);
  }

  return [];
}

function shouldSupportActiveObjective(activeKind: ObjectiveKind, explicitKind: ObjectiveKind, text: string) {
  if (activeKind === "draft_email" && (explicitKind === "show_calendar" || explicitKind === "search_notes")) return true;
  if (activeKind === "search_notes" && explicitKind === "summarize_notes") return true;
  if (activeKind === "search_files" && explicitKind === "summarize_file") return true;
  return /\b(use|check|include|mention)\b/.test(text);
}

function findPreviousObjective(text: string, activeObjective: ObjectiveFrame | null, objectives: ObjectiveFrame[]) {
  if (!/\b(go back to|switch to)\b/.test(text)) return null;

  const kind = classifyObjectiveKind(text);
  const candidates = objectives
    .filter((objective) => objective.id !== activeObjective?.id)
    .filter((objective) => kind === "unknown" || objective.kind === kind)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return candidates[0] ?? null;
}

function decision(
  route: ObjectiveRoutingDecision["route"],
  objectiveKind: ObjectiveKind,
  reason: string,
  confidence: number,
  targetObjectiveId?: string,
): ObjectiveRoutingDecision {
  return {
    route,
    objectiveKind,
    confidence,
    reason,
    targetObjectiveId,
    requestedContext: createContextRequirements(objectiveKind, reason),
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
