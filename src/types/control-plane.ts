export type ControlPlaneSensitivity = "local" | "sensitive" | "restricted" | "external_shareable";
export type ControlPlaneFreshnessState = "fresh" | "stale" | "unknown";
export type CommitmentTier = "observe" | "prepare" | "propose" | "commit";
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

export interface ApprovalRequest {
  approvalId: string;
  sessionId: string;
  operationId: string;
  planId: string;
  planRevision: number;
  commitmentTier: CommitmentTier;
  actor: string;
  target: string;
  scope: string;
  expectedEffect: string;
  dataDisclosure: string;
  reversibility: string;
  preview: Record<string, string>;
  expiresAtMs: number;
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
  recoverySnapshot: unknown;
  recoveryReport: RecoveryReport;
  verifiedNonExecution: boolean;
}
