import { getCapabilityDefinition } from "@/capabilities/capability-registry";
import { canRunCapability, createApprovalGateForCapability } from "@/capabilities/approval-policy";
import type { CapabilityRunContext, CapabilityRunRequest, CapabilityRunResult } from "@/capabilities/capability-types";

export function runLocalCapabilityMockOrReal(
  request: CapabilityRunRequest,
  context: CapabilityRunContext,
): CapabilityRunResult {
  const definition = getCapabilityDefinition(request.id);
  const payload = request.payload ?? {};

  if (!canRunCapability(request.id, context, payload)) {
    return {
      ok: false,
      capabilityId: request.id,
      status: "needs_approval",
      message: "Capability is blocked until permission, approval, or trusted-root requirements are satisfied.",
      approvalGate: createApprovalGateForCapability(request.id, payload),
    };
  }

  if (!definition.implemented) {
    return {
      ok: false,
      capabilityId: request.id,
      status: "not_implemented",
      message: `${definition.label} is not implemented yet. The request was captured safely without crashing.`,
      data: { payload },
    };
  }

  return {
    ok: true,
    capabilityId: request.id,
    status: "completed",
    message: `${definition.label} completed in local/mock mode.`,
    data: { payload },
  };
}
