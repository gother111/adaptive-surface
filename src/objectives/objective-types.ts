import type { CapabilityId } from "@/capabilities/capability-types";

export type ObjectiveKind =
  | "draft_email"
  | "reply_to_email"
  | "summarize_email_or_thread"
  | "show_calendar"
  | "schedule_meeting"
  | "prepare_meeting"
  | "search_notes"
  | "summarize_notes"
  | "create_reminder"
  | "show_reminders"
  | "search_files"
  | "summarize_file"
  | "analyze_file_or_table"
  | "create_chart"
  | "catch_up"
  | "create_decision_brief"
  | "create_status_report"
  | "compare_options"
  | "quick_note"
  | "unknown";

export interface ContextRequirement {
  id: string;
  source: "mail" | "calendar" | "notes" | "reminders" | "files" | "surface" | "manual";
  reason: string;
  status: "missing" | "loading" | "available" | "unavailable";
}

export interface PlannedAction {
  id: string;
  capabilityId: CapabilityId;
  label: string;
  requiresApproval: boolean;
}

export interface CompletedAction {
  id: string;
  capabilityId: CapabilityId;
  label: string;
  completedAt: number;
}

export interface ObjectiveUtterance {
  id: string;
  text: string;
  createdAt: number;
  route: ObjectiveRouteKind;
}

export interface ObjectiveFrame {
  id: string;
  kind: ObjectiveKind;
  status: "forming" | "active" | "waiting_for_context" | "needs_approval" | "blocked" | "completed" | "paused";
  title: string;
  userGoal: string;
  primarySurfaceId?: string;
  activeObjectIds: string[];
  requiredContext: ContextRequirement[];
  plannedActions: PlannedAction[];
  completedActions: CompletedAction[];
  utterances: ObjectiveUtterance[];
  slots: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type ObjectiveRouteKind =
  | "continue_current_objective"
  | "refine_current_objective"
  | "add_supporting_context"
  | "create_new_objective"
  | "switch_to_previous_objective"
  | "complete_objective"
  | "request_approval"
  | "unknown";

export interface ObjectiveRoutingDecision {
  route: ObjectiveRouteKind;
  objectiveKind: ObjectiveKind;
  confidence: number;
  reason: string;
  targetObjectiveId?: string;
  requestedContext: ContextRequirement[];
}
