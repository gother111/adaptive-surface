import type { CapabilityDefinition, CapabilityId } from "@/capabilities/capability-types";

const capabilities: Record<CapabilityId, CapabilityDefinition> = {
  "mail.read": capability("mail.read", "Read Mail", "safe_read", true),
  "mail.draft": capability("mail.draft", "Draft email", "local_write", true),
  "mail.send": capability("mail.send", "Send email", "external_write", false),
  "calendar.read": capability("calendar.read", "Read Calendar", "safe_read", true),
  "calendar.create_event": capability("calendar.create_event", "Create calendar event", "external_write", false),
  "notes.read": capability("notes.read", "Read Notes", "safe_read", true),
  "notes.search": capability("notes.search", "Search Notes", "safe_read", true),
  "reminders.read": capability("reminders.read", "Read Reminders", "safe_read", false),
  "reminders.create": capability("reminders.create", "Create reminder", "local_write", false),
  "files.search": capability("files.search", "Search trusted files", "safe_read", true, true),
  "files.read": capability("files.read", "Read trusted file", "safe_read", true, true),
  "files.summarize": capability("files.summarize", "Summarize trusted file", "safe_read", false, true),
  "surface.create": capability("surface.create", "Create surface", "local_write", true),
  "surface.update": capability("surface.update", "Update surface", "local_write", true),
  "artifact.copy": capability("artifact.copy", "Copy artifact", "local_write", true),
  "artifact.export": capability("artifact.export", "Export artifact", "local_write", false),
};

export function getCapabilityDefinition(id: CapabilityId) {
  return capabilities[id];
}

export function listCapabilityDefinitions() {
  return Object.values(capabilities);
}

function capability(
  id: CapabilityId,
  label: string,
  riskLevel: CapabilityDefinition["riskLevel"],
  implemented: boolean,
  trustedRootRequired = false,
): CapabilityDefinition {
  return { id, label, riskLevel, implemented, trustedRootRequired };
}
