import type { CapabilityId } from "@/capabilities/capability-types";
import type { ContextRequirement, ObjectiveKind, PlannedAction } from "@/objectives/objective-types";

interface ObjectiveDefinition {
  kind: ObjectiveKind;
  title: string;
  primarySurfaceKind?: string;
  defaultContext: Array<ContextRequirement["source"]>;
  plannedCapabilities: CapabilityId[];
}

const definitions: Record<ObjectiveKind, ObjectiveDefinition> = {
  draft_email: definition("draft_email", "Draft email", "email_draft", ["mail"], ["mail.draft"]),
  reply_to_email: definition("reply_to_email", "Reply to email", "email_draft", ["mail"], ["mail.draft"]),
  summarize_email_or_thread: definition("summarize_email_or_thread", "Summarize email", "mail", ["mail"], ["mail.read"]),
  show_calendar: definition("show_calendar", "Show calendar", "calendar", ["calendar"], ["calendar.read"]),
  schedule_meeting: definition("schedule_meeting", "Schedule meeting", "calendar", ["calendar"], ["calendar.create_event"]),
  prepare_meeting: definition("prepare_meeting", "Prepare meeting", "calendar", ["calendar", "notes", "mail"], ["calendar.read", "notes.search", "mail.read"]),
  search_notes: definition("search_notes", "Search notes", "notes", ["notes"], ["notes.search"]),
  summarize_notes: definition("summarize_notes", "Summarize notes", "notes", ["notes"], ["notes.read"]),
  create_reminder: definition("create_reminder", "Create reminder", "calendar", ["reminders"], ["reminders.create"]),
  show_reminders: definition("show_reminders", "Show reminders", "calendar", ["reminders"], ["reminders.read"]),
  search_files: definition("search_files", "Search files", "document", ["files"], ["files.search"]),
  summarize_file: definition("summarize_file", "Summarize file", "document", ["files"], ["files.read", "files.summarize"]),
  analyze_file_or_table: definition("analyze_file_or_table", "Analyze file or table", "table", ["files"], ["files.read"]),
  create_chart: definition("create_chart", "Create chart", "chart", ["files"], ["files.read", "surface.create"]),
  catch_up: definition("catch_up", "Catch up", "mail", ["mail", "calendar", "notes", "reminders", "files"], ["mail.read", "calendar.read", "notes.read", "reminders.read", "files.search"]),
  create_decision_brief: definition("create_decision_brief", "Decision brief", "document", ["notes", "files"], ["notes.read", "files.read"]),
  create_status_report: definition("create_status_report", "Status report", "document", ["mail", "calendar", "notes", "files"], ["mail.read", "calendar.read", "notes.read", "files.read"]),
  compare_options: definition("compare_options", "Compare options", "document", ["notes", "files"], ["files.read"]),
  quick_note: definition("quick_note", "Quick note", "notes", ["manual"], ["notes.read"]),
  unknown: definition("unknown", "Unknown objective", undefined, [], []),
};

export function getObjectiveDefinition(kind: ObjectiveKind) {
  return definitions[kind];
}

export function createContextRequirements(kind: ObjectiveKind, reason: string): ContextRequirement[] {
  return definitions[kind].defaultContext.map((source) => ({
    id: `${kind}_${source}`,
    source,
    reason,
    status: "missing",
  }));
}

export function createPlannedActions(kind: ObjectiveKind): PlannedAction[] {
  return definitions[kind].plannedCapabilities.map((capabilityId) => ({
    id: `${kind}_${capabilityId}`,
    capabilityId,
    label: capabilityId.replace(".", " "),
    requiresApproval: capabilityId.includes("send") || capabilityId.includes("create") || capabilityId.includes("export"),
  }));
}

function definition(
  kind: ObjectiveKind,
  title: string,
  primarySurfaceKind: string | undefined,
  defaultContext: Array<ContextRequirement["source"]>,
  plannedCapabilities: CapabilityId[],
): ObjectiveDefinition {
  return { kind, title, primarySurfaceKind, defaultContext, plannedCapabilities };
}
