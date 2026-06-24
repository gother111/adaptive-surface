export type ControlPlaneSensitivity = "local" | "sensitive" | "restricted" | "external_shareable";
export type ControlPlaneFreshnessState = "fresh" | "stale" | "unknown";
export type CommitmentTier = "observe" | "prepare" | "propose" | "commit";
export type SideEffectClass = "none" | "local_reversible" | "external_consequential" | "destructive" | "unknown";
export type DataEgressDisposition = "allow" | "require_approval" | "deny";
export type PolicyDisposition = "allow" | "require_approval" | "deny";
export type OperationState =
  | "planned"
  | "awaiting_approval"
  | "ready"
  | "dispatched"
  | "acknowledged"
  | "running"
  | "paused"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export interface ControlPlaneDemoInput {
  objective?: string;
  activeApp?: string;
  activeWindow?: string;
  selectedText?: string;
  approvalDecision?: "approve" | "reject" | "cancel";
  nowMs?: number;
}

export interface Freshness {
  state: ControlPlaneFreshnessState;
  observedAtMs: number;
  expiresAtMs?: number;
}

export interface Provenance {
  source: string;
  evidence: string[];
  recordedAtMs: number;
}

export interface ContextReference {
  referenceId: string;
  sourceSystem: string;
  objectType: string;
  externalId?: string;
  uriOrLocator?: string;
  versionOrEtag?: string;
  observedAtMs: number;
  freshness: Freshness;
  sensitivity: ControlPlaneSensitivity;
  provenance: Provenance;
}

export interface ContextSnapshot {
  snapshotId: string;
  revision: number;
  focusContext: ContextReference[];
  sessionContext: ContextReference[];
  relatedContext: ContextReference[];
  unresolvedReferences: string[];
  createdAtMs: number;
}

export interface ObservationEvent {
  eventId: string;
  observedAtMs: number;
  source: string;
  app: string;
  window: string;
  objectReference?: string;
  selectionReference?: string;
  eventKind: string;
  metadata: Record<string, string>;
  freshness: Freshness;
  sensitivity: ControlPlaneSensitivity;
  confidence: number;
}

export interface IntentFrame {
  intentId: string;
  sessionId: string;
  objective: string;
  subject?: string;
  workflowFamily: string;
  lifecycleStage: string;
  desiredOutput?: string;
  bindings: Array<{ slot: string; referenceId: string; confidence: number }>;
  scope: {
    boundedToSnapshot: string;
    targetApps: string[];
    maxOperations: number;
  };
  commitment: CommitmentTier;
  risk: string;
  constraints: string[];
  confidenceByField: Record<string, number>;
  alternativeHypotheses: Array<{ objective: string; reason: string; confidence: number }>;
  contextSnapshotId: string;
  provenance: Provenance;
}

export interface CapabilityDescriptor {
  capabilityId: string;
  providerId: string;
  targetKinds: string[];
  operationKind: string;
  inputSchema: string;
  outputSchema: string;
  readOrWrite: "read" | "write";
  sideEffectClass: string;
  reversibility: string;
  requiredPermissions: string[];
  supportsCancellation: boolean;
  supportsIdempotency: boolean;
  expectedLatency: string;
  availability: string;
  provenanceGuarantee: string;
}

export interface TargetBinding {
  targetId: string;
  sourceSystem: string;
  appOrService: string;
  objectReference?: string;
  capabilityId: string;
  resolutionConfidence: number;
  resolutionReason: string;
}

export interface DelegatedOperation {
  operationId: string;
  planId: string;
  targetBinding: TargetBinding;
  capabilityId: string;
  normalizedInput: Record<string, string>;
  idempotencyKey?: string;
  timeoutMs: number;
  retryPolicy: {
    maxAttempts: number;
    retryIdempotentOnly: boolean;
  };
  state: OperationState;
  correlationId: string;
}

export interface DelegationPlan {
  planId: string;
  sessionId: string;
  intentId: string;
  revision: number;
  steps: DelegatedOperation[];
  dependencies: Array<[string, string]>;
  approvalRequirements: string[];
  expectedOutputs: string[];
  cancellationStrategy: string;
}

export interface ActivityEvent {
  activityEventId: string;
  providerEventId?: string;
  sequence: number;
  occurredAtMs: number;
  sessionId: string;
  planId: string;
  operationId: string;
  state: OperationState;
  progress: number;
  message: string;
  partialArtifacts: string[];
  requiredIntervention?: string;
  error?: {
    kind: string;
    message: string;
    rawDiagnostic?: string;
    retryable: boolean;
  };
  provenance: Provenance;
}

export interface ApprovalBinding {
  approvalId: string;
  operationId: string;
  planId: string;
  planRevision: number;
  capabilityId: string;
  targetBinding: Record<string, string>;
  normalizedInput: Record<string, string>;
  sideEffectClass: SideEffectClass;
  expectedEffect: string;
  dataDisclosure: string;
  expiresAtMs: number;
  contextSnapshotRevision?: number | null;
}

export interface ApprovalRequest {
  approvalId: string;
  sessionId: string;
  operationId: string;
  planId: string;
  planRevision: number;
  capabilityId?: string;
  commitmentTier: CommitmentTier;
  actor: string;
  target: string;
  scope: string;
  expectedEffect: string;
  dataDisclosure: string;
  reversibility: string;
  reason?: string;
  sideEffectClass?: SideEffectClass | null;
  preview: Record<string, string>;
  expiresAtMs: number;
  binding?: ApprovalBinding | null;
}

export interface NormalizedArtifact {
  artifactId: string;
  artifactType: string;
  sourceSystem: string;
  sourceReference?: string;
  contentOrSummary: string;
  status: string;
  version: string;
  generatedByOperation: string;
  intendedWriteBack?: string;
  provenance: Provenance;
}

export interface ExecutionReceipt {
  operationId: string;
  externalResultReference?: string;
  effectSummary: string;
  committedAtMs: number;
  reversibleUntilMs?: number;
  nativeUndoReference?: string;
  provenance: Provenance;
}

export interface RecoveryReport {
  expiredApprovalIds: string[];
  staleContextReferenceIds: string[];
  operationsRequiringVerification: string[];
}

export interface ControlPlaneRunResult {
  observation: ObservationEvent;
  contextSnapshot: ContextSnapshot;
  intent: IntentFrame;
  capabilityRegistry: CapabilityDescriptor[];
  targetBindings: TargetBinding[];
  plan: DelegationPlan;
  activityEvents: ActivityEvent[];
  approvalRequests: ApprovalRequest[];
  artifacts: NormalizedArtifact[];
  receipts: ExecutionReceipt[];
  recoverySnapshot: RecoverySnapshot;
  recoveryReport: RecoveryReport;
  verifiedNonExecution: boolean;
}

export interface RecoverySnapshot {
  snapshotId: string;
  capturedAtMs: number;
  contextSnapshot: ContextSnapshot;
  plan: DelegationPlan;
  activityEvents: ActivityEvent[];
  approvalRequests: ApprovalRequest[];
  artifacts: NormalizedArtifact[];
  receipts: ExecutionReceipt[];
}

export const CONTROL_PLANE_PROTOCOL_VERSION = "control-plane.runtime.v1";

export type WorkUnitKind =
  | "mail_search"
  | "mail_thread_read"
  | "triage_classify"
  | "artifact_create"
  | "pure_synthesis"
  | "legacy_fallback";

export type DependencyKind = "requires_success" | "requires_terminal";
export type JoinPolicy = "all_succeeded" | "any_terminal" | "best_effort";
export type ApprovalRequirement = "none" | "preview" | "explicit_user_approval";
export type RuntimeTerminalStatus = "succeeded" | "failed" | "cancelled" | "timed_out" | "legacy_fallback";
export type SemanticRiskClass = "safe_read" | "local_write" | "external_write" | "destructive" | "unknown";
export type SubmitObjectiveRoute = "handled" | "legacy_fallback";
export type RequestStatus =
  | "accepted"
  | "running"
  | "completed"
  | "failed_retryable"
  | "failed_terminal"
  | "cancelled"
  | "timed_out";

export interface WorkDependency {
  upstreamWorkUnitId: string;
  dependencyKind: DependencyKind;
}

export interface ExecutionPolicy {
  timeoutMs: number;
  approvalRequirement: ApprovalRequirement;
  sideEffectClass: string;
  retryPolicy: {
    maxAttempts: number;
    retryIdempotentOnly: boolean;
  };
  idempotencyKey?: string | null;
  supportsCancellation: boolean;
}

export interface WorkUnit {
  workUnitId: string;
  kind: WorkUnitKind;
  capabilityId: string;
  title: string;
  dependencies: WorkDependency[];
  joinPolicy: JoinPolicy;
  executionPolicy: ExecutionPolicy;
  input: Record<string, string>;
  state: OperationState;
}

export interface TaskGraph {
  graphId: string;
  sessionId: string;
  objectiveId: string;
  planRevision: number;
  workUnits: WorkUnit[];
  createdAtMs: number;
}

export interface SafeDiagnostic {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ArtifactEnvelope {
  artifactId: string;
  artifactType: string;
  title: string;
  summary: string;
  body?: string | null;
  items: Array<Record<string, string>>;
  status: string;
  sourceCapabilityId: string;
  sourceReferences: string[];
  metadata: Record<string, string>;
  createdAtMs: number;
}

export type RuntimeEventPayload =
  | {
      type: "objective_accepted";
      data: {
        utterance: string;
        objective: string;
        routedBy: string;
      };
    }
  | {
      type: "plan_created";
      data: {
        graph: TaskGraph;
        summary: string;
      };
    }
  | {
      type: "work_unit_lifecycle";
      data: {
        workUnitId: string;
        state: OperationState;
        progress: number;
        message: string;
      };
    }
  | {
      type: "artifact_added";
      data: {
        artifact: ArtifactEnvelope;
      };
    }
  | {
      type: "approval_required";
      data: {
        approval: ApprovalRequest;
      };
    }
  | {
      type: "approval_resolved";
      data: {
        approvalId: string;
        decision: "approve" | "reject" | "cancel";
      };
    }
  | {
      type: "conflict_detected";
      data: {
        message: string;
        safeDiagnostic: SafeDiagnostic;
      };
    }
  | {
      type: "snapshot_recovered";
      data: {
        recoveredEventCount: number;
      };
    }
  | {
      type: "execution_completed";
      data: {
        status: RuntimeTerminalStatus;
        summary: string;
      };
    }
  | {
      type: "legacy_fallback_requested";
      data: {
        reason: string;
      };
    };

export interface RuntimeEventEnvelope {
  protocolVersion: string;
  eventId: string;
  sequence: number;
  sessionId: string;
  objectiveId: string;
  planRevision: number;
  graphId?: string | null;
  workUnitId?: string | null;
  runId: string;
  occurredAtMs: number;
  payload: RuntimeEventPayload;
}

export interface SemanticCapabilityDescriptor {
  capabilityId: string;
  providerBinding: string;
  inputContract: string;
  outputContract: string;
  operationKind: string;
  readOrWrite: "read" | "write";
  availability: string;
  riskClass: SemanticRiskClass;
  approvalRequirement: ApprovalRequirement;
  timeoutMs: number;
  supportsCancellation: boolean;
  idempotencySemantics: string;
  sideEffectClass: SideEffectClass;
  reversibility: string;
  requiredPermissions: string[];
}

export interface SubmitObjectiveInput {
  utterance: string;
  sessionId?: string | null;
  clientRequestId?: string | null;
  modelIntentHint?: string | null;
  nowMs?: number | null;
}

export interface ControlPlaneSessionSnapshot {
  protocolVersion: string;
  sessionId: string;
  objectiveId?: string | null;
  activeGraphId?: string | null;
  planRevision: number;
  nextSequence: number;
  taskGraphs: TaskGraph[];
  artifacts: ArtifactEnvelope[];
  pendingApprovals: ApprovalRequest[];
  recentEvents: RuntimeEventEnvelope[];
}

export interface SubmitObjectiveResponse {
  route: SubmitObjectiveRoute;
  sessionId: string;
  objectiveId: string;
  runId: string;
  graphId?: string | null;
  planRevision: number;
  acceptedSequence: number;
  completed: boolean;
  events: RuntimeEventEnvelope[];
  snapshot: ControlPlaneSessionSnapshot;
  pendingApprovals: ApprovalRequest[];
}

export interface RuntimeEventsAfterInput {
  sessionId: string;
  afterSequence: number;
  limit?: number | null;
}

export interface RuntimeEventsAfterResponse {
  sessionId: string;
  afterSequence: number;
  nextSequence: number;
  events: RuntimeEventEnvelope[];
}

export interface OperationCommand {
  sessionId: string;
  workUnitId: string;
  planRevision: number;
  approvalId?: string | null;
  nowMs?: number | null;
}
