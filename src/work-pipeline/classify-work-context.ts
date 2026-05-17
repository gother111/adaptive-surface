import type { ObjectiveFrame } from "@/objectives/objective-types";
import type { WorkObject } from "@/work-objects/work-object-types";

export function scoreObjectRelevanceToObjective(object: WorkObject, objective: ObjectiveFrame): number {
  let score = 0;
  const goal = `${objective.userGoal} ${objective.title}`.toLowerCase();
  const haystack = `${object.title} ${object.subtitle ?? ""} ${object.contentPreview ?? ""}`.toLowerCase();

  if (objective.kind === "draft_email" && object.kind === "calendar_event" && /\b(calendar|available|availability|free|schedule|next tuesday)\b/.test(goal)) {
    score += 0.6;
  }

  if (objective.kind === "draft_email" && (object.kind === "email_message" || object.kind === "contact") && personTerms(goal).some((term) => haystack.includes(term))) {
    score += 0.55;
  }

  if ((objective.kind === "search_notes" || objective.kind === "summarize_notes") && object.kind === "note" && sharedTerms(goal, haystack) > 0) {
    score += 0.7;
  }

  if (objective.kind === "catch_up" && ["email_message", "note", "reminder", "calendar_event", "file", "document"].includes(object.kind)) {
    score += 0.5;
  }

  if (objective.kind === "summarize_file" && ["file", "document", "spreadsheet"].includes(object.kind)) {
    score += 0.65;
  }

  if (objective.kind === "create_reminder" && object.kind === "reminder") {
    score += 0.6;
  }

  score += Math.min(0.25, sharedTerms(goal, haystack) * 0.05);

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export function explainObjectRelevance(object: WorkObject, objective: ObjectiveFrame): string[] {
  const score = scoreObjectRelevanceToObjective(object, objective);
  if (score === 0) return [];
  const reasons = [`${object.kind} matches ${objective.kind}`];
  if (object.source) reasons.push(`source: ${object.source}`);
  return reasons;
}

function personTerms(value: string) {
  return value.match(/\b[a-z]{3,}\b/g)?.filter((term) => !STOP_WORDS.has(term)) ?? [];
}

function sharedTerms(left: string, right: string) {
  const rightTerms = new Set(personTerms(right));
  return personTerms(left).filter((term) => rightTerms.has(term)).length;
}

const STOP_WORDS = new Set(["the", "and", "that", "this", "with", "from", "email", "draft", "show", "find", "about", "make"]);
