export type SecuritySkillLifecycle = "production" | "internal" | "experimental" | "disabled";

export type SecurityRiskTier = "R0" | "R1" | "R2" | "R3" | "R4";

export type ApprovalMode = "none" | "once_per_scope" | "every_execution" | "step_up" | "prohibited";

export type SecuritySurface =
  | "Decision Brief"
  | "Infinite Canvas"
  | "Comparison Table"
  | "Approval Flow"
  | "Research Workspace"
  | "Security Console"
  | "Integration Map"
  | "Risk Register"
  | "Evidence Board"
  | "Test Runner"
  | "Review Room"
  | "Audit Trail"
  | "Evidence Matrix"
  | "Quality Dashboard";

export type SecuritySkillId =
  | "auditing-mcp-servers-for-tool-poisoning"
  | "detecting-ai-model-prompt-injection-attacks"
  | "implementing-llm-guardrails-for-security"
  | "implementing-secret-scanning-with-gitleaks"
  | "performing-threat-modeling-with-owasp-threat-dragon"
  | "analyzing-sbom-for-supply-chain-vulnerabilities"
  | "implementing-sigstore-for-software-signing"
  | "implementing-supply-chain-security-with-in-toto";

export interface SecuritySkillManifest {
  schemaVersion: 1;
  id: SecuritySkillId;
  displayName: string;
  summary: string;
  lifecycle: SecuritySkillLifecycle;
  source: {
    repository: "https://github.com/mukul975/Anthropic-Cybersecurity-Skills";
    release: "v1.3.0";
    commit: "101ca0bd887a295e39cc20a100efa571937ca969";
    path: string;
    license: "Apache-2.0";
    reviewedAt: "2026-06-24";
    sourceSha256: string;
    curatedSha256: string;
  };
  atlas: {
    domainIds: Array<53 | 55>;
    workflowTags: string[];
    surfaces: SecuritySurface[];
  };
  routing: {
    positiveExamples: string[];
    negativeExamples: string[];
    requiredSignals: string[];
    confidenceThreshold: number;
  };
  platform: {
    macos: boolean;
    minimumVersion?: string;
  };
  capabilities: string[];
  risk: {
    tier: SecurityRiskTier;
    approval: ApprovalMode;
    possibleSideEffects: string[];
  };
  dataAccess: {
    readableScopes: string[];
    writableScopes: string[];
    classifications: string[];
    defaultPersistence: "none" | "ephemeral" | "local";
  };
  network: {
    default: "deny" | "approval_required";
    allowedDestinations: string[];
    purpose: string[];
  };
  executors: Array<{
    adapterId: string;
    required: boolean;
    supportedVersionRange?: string;
  }>;
  verification: string[];
  rollback: string[];
}

export interface SecurityCatalogEntry {
  id: SecuritySkillId;
  displayName: string;
  summary: string;
  lifecycle: SecuritySkillLifecycle;
  atlas: SecuritySkillManifest["atlas"];
  routing: SecuritySkillManifest["routing"];
  risk: SecuritySkillManifest["risk"];
  capabilities: string[];
}

export interface CuratedSecurityProcedure {
  id: SecuritySkillId;
  title: string;
  lifecycle: SecuritySkillLifecycle;
  sourcePath: string;
  sourceSha256: string;
  intent: string;
  userOutcome: string;
  workflow: string[];
  safetyBoundaries: string[];
  capabilityRequirements: string[];
  verificationRequirements: string[];
  rollback: string[];
  userFacingSurfaces: SecuritySurface[];
  notes: string[];
}

export interface SecurityFeatureFlags {
  security_pack_enabled: boolean;
  security_mcp_review: boolean;
  security_secret_scan: boolean;
  security_threat_model: boolean;
  security_prompt_injection_detection: boolean;
  security_llm_guardrails: boolean;
  security_sbom_analysis: boolean;
  security_sigstore_verification: boolean;
  security_in_toto_verification: boolean;
  security_external_mcp_scanner: boolean;
  security_active_testing: boolean;
  security_artifact_signing: boolean;
  security_attestation_generation: boolean;
}

export type PolicyEffect = "allow" | "require_approval" | "deny";

export interface SecurityPolicyRequest {
  actionId: string;
  skillId: SecuritySkillId;
  capabilityIds: string[];
  workspaceRoot?: string;
  readPaths: string[];
  writePaths: string[];
  networkDestinations: string[];
  executableAdapter?: string;
  toolVersion?: string;
  dataClassifications: string[];
  userGestureId?: string;
  requestedAt: string;
  approvalId?: string;
}

export interface SecurityPolicyDecision {
  effect: PolicyEffect;
  reasons: string[];
  grantedCapabilities: string[];
  grantedPathScopes: string[];
  grantedNetworkDestinations: string[];
  approval?: {
    mode: "once" | "per_execution" | "step_up";
    summary: string;
    expiresAt?: string;
  };
}

export type SecurityActionErrorCode =
  | "approval_required"
  | "permission_denied"
  | "unsafe_path"
  | "tool_missing"
  | "tool_version_unsupported"
  | "invalid_tool_output"
  | "process_timeout"
  | "output_limit_exceeded"
  | "network_denied"
  | "verification_failed"
  | "cancelled"
  | "internal_error";

export type SecurityActionEvent<Finding, Result> =
  | { type: "started"; message: string }
  | { type: "progress"; completed?: number; total?: number; message: string }
  | { type: "finding"; finding: Finding }
  | { type: "approval_required"; approvalId: string }
  | { type: "warning"; code: string; message: string }
  | { type: "completed"; result: Result }
  | { type: "failed"; code: SecurityActionErrorCode; message: string }
  | { type: "cancelled" };

export interface SecurityPreflightResult {
  ok: boolean;
  code?: SecurityActionErrorCode;
  message: string;
  policyDecision?: SecurityPolicyDecision;
  commandPreview?: {
    adapterId: string;
    executable?: string;
    args: string[];
    redactedArgs: string[];
  };
}

export interface SecurityVerificationResult {
  ok: boolean;
  message: string;
  evidence?: string[];
}

export interface SecurityRollbackResult {
  ok: boolean;
  message: string;
}

export interface SecurityActionContext {
  workspaceRoot: string;
  approvedReadPaths: string[];
  approvedWritePaths: string[];
  now: string;
  signal?: AbortSignal;
}

export interface SecurityActionAdapter<Input, Finding, Result> {
  readonly id: string;
  readonly capabilities: string[];
  preflight(input: Input, context: SecurityActionContext): Promise<SecurityPreflightResult>;
  execute(input: Input, context: SecurityActionContext): AsyncIterable<SecurityActionEvent<Finding, Result>>;
  verify(result: Result, context: SecurityActionContext): Promise<SecurityVerificationResult>;
  rollback?(result: Result, context: SecurityActionContext): Promise<SecurityRollbackResult>;
}

export interface SecurityRouteContext {
  atlasDomainIds?: Array<53 | 55>;
  surface?: SecuritySurface;
  workspaceHasRepository?: boolean;
  currentObjectKind?: "mcp" | "repository" | "directory" | "architecture" | "sbom" | "artifact" | "attestation" | "unknown";
  platform?: "macos" | "web" | "unknown";
  featureFlags?: Partial<SecurityFeatureFlags>;
}

export interface SecurityRouteCandidate {
  entry: SecurityCatalogEntry;
  confidence: number;
  matchedSignals: string[];
  rejectedSignals: string[];
}

export interface SecurityRouteResult {
  selected: SecurityRouteCandidate | null;
  candidates: SecurityRouteCandidate[];
  surface: SecuritySurface;
  shouldExecute: boolean;
  reason: string;
  durationMs: number;
}

export interface SecurityAuditEvent {
  timestamp: string;
  workflowId: string;
  skillId: SecuritySkillId;
  actionId: string;
  policyDecision: PolicyEffect;
  grantedScope: string[];
  approvalReference?: string;
  executableAdapter?: string;
  executableVersion?: string;
  sourceSkillCommit: "101ca0bd887a295e39cc20a100efa571937ca969";
  findingCount: number;
  verificationOutcome: "not_run" | "passed" | "failed";
  failureCode?: SecurityActionErrorCode;
}
