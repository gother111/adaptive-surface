import { getCapabilityDefinition } from "@/capabilities/capability-registry";
import type { ApprovalGate, CapabilityId, CapabilityRunContext } from "@/capabilities/capability-types";

export function requiresApproval(id: CapabilityId) {
  const definition = getCapabilityDefinition(id);
  return (
    definition.riskLevel === "external_write" ||
    definition.riskLevel === "destructive" ||
    id === "mail.send" ||
    id === "calendar.create_event" ||
    id === "reminders.create"
  );
}

export function canRunCapability(id: CapabilityId, context: CapabilityRunContext, payload: Record<string, unknown> = {}) {
  const definition = getCapabilityDefinition(id);

  if (requiresApproval(id) && !context.explicitApproval) {
    return false;
  }

  if (definition.riskLevel === "safe_read" && !context.permissionGranted) {
    return false;
  }

  if (definition.trustedRootRequired && !payloadPathIsTrusted(payload.path, context.trustedFileRoots)) {
    return false;
  }

  return true;
}

export function createApprovalGateForCapability(
  id: CapabilityId,
  payload: Record<string, unknown> = {},
): ApprovalGate {
  const definition = getCapabilityDefinition(id);

  return {
    capabilityId: id,
    required: requiresApproval(id) || definition.riskLevel === "local_write",
    reason: approvalReason(id),
    riskLevel: definition.riskLevel,
    preview: payload,
  };
}

export function payloadPathIsTrusted(path: unknown, trustedRoots: string[]) {
  if (typeof path !== "string") {
    return false;
  }

  return trustedRoots.some((root) => path === root || path.startsWith(`${root}/`));
}

function approvalReason(id: CapabilityId) {
  if (id === "mail.send") return "Sending email is externally visible and always needs explicit approval.";
  if (id === "calendar.create_event") return "Creating calendar events changes an external local app and needs approval.";
  if (id === "reminders.create") return "Reminder creation should show a preview before writing.";
  return "This capability changes local state or produces an external side effect.";
}
