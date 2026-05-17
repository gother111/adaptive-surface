export type CapabilityId =
  | "mail.read"
  | "mail.draft"
  | "mail.send"
  | "calendar.read"
  | "calendar.create_event"
  | "notes.read"
  | "notes.search"
  | "reminders.read"
  | "reminders.create"
  | "files.search"
  | "files.read"
  | "files.summarize"
  | "surface.create"
  | "surface.update"
  | "artifact.copy"
  | "artifact.export";

export type CapabilityRiskLevel = "safe_read" | "local_write" | "external_write" | "destructive";

export interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  riskLevel: CapabilityRiskLevel;
  implemented: boolean;
  trustedRootRequired?: boolean;
}

export interface CapabilityRunContext {
  trustedFileRoots: string[];
  permissionGranted: boolean;
  explicitApproval: boolean;
}

export interface CapabilityRunRequest {
  id: CapabilityId;
  payload?: Record<string, unknown>;
}

export interface ApprovalGate {
  capabilityId: CapabilityId;
  required: boolean;
  reason: string;
  riskLevel: CapabilityRiskLevel;
  preview: Record<string, unknown>;
}

export interface CapabilityRunResult {
  ok: boolean;
  capabilityId: CapabilityId;
  status: "completed" | "needs_approval" | "not_implemented" | "blocked";
  message: string;
  approvalGate?: ApprovalGate;
  data?: unknown;
}
