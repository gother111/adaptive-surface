use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

pub type Metadata = BTreeMap<String, String>;
pub const CONTROL_PLANE_PROTOCOL_VERSION: &str = "control-plane.runtime.v1";

macro_rules! stable_id {
    ($name:ident) => {
        #[derive(
            Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
        )]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

stable_id!(SessionId);
stable_id!(ObjectiveId);
stable_id!(TaskGraphId);
stable_id!(WorkUnitId);
stable_id!(RunId);
stable_id!(RuntimeEventId);
stable_id!(ArtifactId);
stable_id!(ApprovalId);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Sensitivity {
    Local,
    Sensitive,
    Restricted,
    ExternalShareable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessState {
    Fresh,
    Stale,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Freshness {
    pub state: FreshnessState,
    pub observed_at_ms: u64,
    pub expires_at_ms: Option<u64>,
}

impl Freshness {
    pub fn fresh(observed_at_ms: u64, ttl_ms: u64) -> Self {
        Self {
            state: FreshnessState::Fresh,
            observed_at_ms,
            expires_at_ms: Some(observed_at_ms.saturating_add(ttl_ms)),
        }
    }

    pub fn mark_for_now(&mut self, now_ms: u64) {
        if self.expires_at_ms.is_some_and(|expires_at_ms| expires_at_ms <= now_ms) {
            self.state = FreshnessState::Stale;
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source: String,
    pub evidence: Vec<String>,
    pub recorded_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservationSource {
    Synthetic,
    NativeMacos,
    FrontendIpc,
    Connector,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservationEventKind {
    ActiveWindowChanged,
    SelectionChanged,
    SessionResumed,
    UserObjectiveReceived,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservationEvent {
    pub event_id: String,
    pub observed_at_ms: u64,
    pub source: ObservationSource,
    pub app: String,
    pub window: String,
    pub object_reference: Option<String>,
    pub selection_reference: Option<String>,
    pub event_kind: ObservationEventKind,
    pub metadata: Metadata,
    pub freshness: Freshness,
    pub sensitivity: Sensitivity,
    pub confidence: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectType {
    ActiveWindow,
    SelectedText,
    SessionObjective,
    NormalizedArtifact,
    ExternalResult,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextReference {
    pub reference_id: String,
    pub source_system: String,
    pub object_type: ObjectType,
    pub external_id: Option<String>,
    pub uri_or_locator: Option<String>,
    pub version_or_etag: Option<String>,
    pub observed_at_ms: u64,
    pub freshness: Freshness,
    pub sensitivity: Sensitivity,
    pub provenance: Provenance,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub snapshot_id: String,
    pub revision: u64,
    pub focus_context: Vec<ContextReference>,
    pub session_context: Vec<ContextReference>,
    pub related_context: Vec<ContextReference>,
    pub unresolved_references: Vec<String>,
    pub created_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommitmentTier {
    Observe,
    Prepare,
    Propose,
    Commit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowFamily {
    Communication,
    Calendar,
    File,
    Surface,
    General,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleStage {
    Discover,
    Draft,
    Review,
    Commit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    SafeRead,
    LocalWrite,
    ExternalWrite,
    Destructive,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentBinding {
    pub slot: String,
    pub reference_id: String,
    pub confidence: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentScope {
    pub bounded_to_snapshot: String,
    pub target_apps: Vec<String>,
    pub max_operations: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentAlternative {
    pub objective: String,
    pub reason: String,
    pub confidence: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentFrame {
    pub intent_id: String,
    pub session_id: String,
    pub objective: String,
    pub subject: Option<String>,
    pub workflow_family: WorkflowFamily,
    pub lifecycle_stage: LifecycleStage,
    pub desired_output: Option<String>,
    pub bindings: Vec<IntentBinding>,
    pub scope: IntentScope,
    pub commitment: CommitmentTier,
    pub risk: RiskLevel,
    pub constraints: Vec<String>,
    pub confidence_by_field: BTreeMap<String, u8>,
    pub alternative_hypotheses: Vec<IntentAlternative>,
    pub context_snapshot_id: String,
    pub provenance: Provenance,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    Read,
    PrepareDraft,
    MutateExternal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadOrWrite {
    Read,
    Write,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SideEffectClass {
    None,
    LocalReversible,
    ExternalConsequential,
    Destructive,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityAvailability {
    Available,
    Unavailable,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub capability_id: String,
    pub provider_id: String,
    pub target_kinds: Vec<ObjectType>,
    pub operation_kind: OperationKind,
    pub input_schema: String,
    pub output_schema: String,
    pub read_or_write: ReadOrWrite,
    pub side_effect_class: SideEffectClass,
    pub reversibility: String,
    pub required_permissions: Vec<String>,
    pub supports_cancellation: bool,
    pub supports_idempotency: bool,
    pub expected_latency: String,
    pub availability: CapabilityAvailability,
    pub provenance_guarantee: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetBinding {
    pub target_id: String,
    pub source_system: String,
    pub app_or_service: String,
    pub object_reference: Option<String>,
    pub capability_id: String,
    pub resolution_confidence: u8,
    pub resolution_reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationState {
    Planned,
    AwaitingApproval,
    Ready,
    Dispatched,
    Acknowledged,
    Running,
    Paused,
    Succeeded,
    PartiallySucceeded,
    Failed,
    Cancelled,
    Expired,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    pub max_attempts: u8,
    pub retry_idempotent_only: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegatedOperation {
    pub operation_id: String,
    pub plan_id: String,
    pub target_binding: TargetBinding,
    pub capability_id: String,
    pub normalized_input: Metadata,
    pub idempotency_key: Option<String>,
    pub timeout_ms: u64,
    pub retry_policy: RetryPolicy,
    pub state: OperationState,
    pub correlation_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegationPlan {
    pub plan_id: String,
    pub session_id: String,
    pub intent_id: String,
    pub revision: u64,
    pub steps: Vec<DelegatedOperation>,
    pub dependencies: Vec<(String, String)>,
    pub approval_requirements: Vec<String>,
    pub expected_outputs: Vec<String>,
    pub cancellation_strategy: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ControlPlaneErrorKind {
    PolicyBlocked,
    InvalidTransition,
    CapabilityUnavailable,
    DuplicateDispatch,
    ExecutorFailed,
    RecoveryRequiresVerification,
    Io,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlPlaneError {
    pub kind: ControlPlaneErrorKind,
    pub message: String,
    pub raw_diagnostic: Option<String>,
    pub retryable: bool,
}

impl ControlPlaneError {
    pub fn new(kind: ControlPlaneErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            raw_diagnostic: None,
            retryable: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub activity_event_id: String,
    pub provider_event_id: Option<String>,
    pub sequence: u64,
    pub occurred_at_ms: u64,
    pub session_id: String,
    pub plan_id: String,
    pub operation_id: String,
    pub state: OperationState,
    pub progress: u8,
    pub message: String,
    pub partial_artifacts: Vec<String>,
    pub required_intervention: Option<String>,
    pub error: Option<ControlPlaneError>,
    pub provenance: Provenance,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalActor {
    User,
    Policy,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub approval_id: String,
    pub session_id: String,
    pub operation_id: String,
    pub plan_id: String,
    pub plan_revision: u64,
    pub commitment_tier: CommitmentTier,
    pub actor: ApprovalActor,
    pub target: String,
    pub scope: String,
    pub expected_effect: String,
    pub data_disclosure: String,
    pub reversibility: String,
    pub preview: Metadata,
    pub expires_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterventionKind {
    Pause,
    Resume,
    Cancel,
    Retry,
    Approve,
    Reject,
    Redirect,
    Amend,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterventionCommand {
    pub command_id: String,
    pub session_id: String,
    pub operation_id: String,
    pub kind: InterventionKind,
    pub payload: Metadata,
    pub issued_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactStatus {
    SourceMaterial,
    DerivedInterpretation,
    PreparedDraft,
    CommittedExternalResult,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedArtifact {
    pub artifact_id: String,
    pub artifact_type: String,
    pub source_system: String,
    pub source_reference: Option<String>,
    pub content_or_summary: String,
    pub status: ArtifactStatus,
    pub version: String,
    pub generated_by_operation: String,
    pub intended_write_back: Option<String>,
    pub provenance: Provenance,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionReceipt {
    pub operation_id: String,
    pub external_result_reference: Option<String>,
    pub effect_summary: String,
    pub committed_at_ms: u64,
    pub reversible_until_ms: Option<u64>,
    pub native_undo_reference: Option<String>,
    pub provenance: Provenance,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub snapshot_id: String,
    pub captured_at_ms: u64,
    pub context_snapshot: ContextSnapshot,
    pub plan: DelegationPlan,
    pub activity_events: Vec<ActivityEvent>,
    pub approval_requests: Vec<ApprovalRequest>,
    pub artifacts: Vec<NormalizedArtifact>,
    pub receipts: Vec<ExecutionReceipt>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approve,
    Reject,
    Cancel,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlPlaneDemoInput {
    pub objective: Option<String>,
    pub active_app: Option<String>,
    pub active_window: Option<String>,
    pub selected_text: Option<String>,
    pub approval_decision: Option<ApprovalDecision>,
    pub now_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReport {
    pub expired_approval_ids: Vec<String>,
    pub stale_context_reference_ids: Vec<String>,
    pub operations_requiring_verification: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlPlaneRunResult {
    pub observation: ObservationEvent,
    pub context_snapshot: ContextSnapshot,
    pub intent: IntentFrame,
    pub capability_registry: Vec<CapabilityDescriptor>,
    pub target_bindings: Vec<TargetBinding>,
    pub plan: DelegationPlan,
    pub activity_events: Vec<ActivityEvent>,
    pub approval_requests: Vec<ApprovalRequest>,
    pub artifacts: Vec<NormalizedArtifact>,
    pub receipts: Vec<ExecutionReceipt>,
    pub recovery_snapshot: RecoverySnapshot,
    pub recovery_report: RecoveryReport,
    pub verified_non_execution: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkUnitKind {
    MailSearch,
    MailThreadRead,
    TriageClassify,
    ArtifactCreate,
    PureSynthesis,
    LegacyFallback,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DependencyKind {
    RequiresSuccess,
    RequiresTerminal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkDependency {
    pub upstream_work_unit_id: WorkUnitId,
    pub dependency_kind: DependencyKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JoinPolicy {
    AllSucceeded,
    AnyTerminal,
    BestEffort,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalRequirement {
    None,
    Preview,
    ExplicitUserApproval,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPolicy {
    pub timeout_ms: u64,
    pub approval_requirement: ApprovalRequirement,
    pub side_effect_class: SideEffectClass,
    pub retry_policy: RetryPolicy,
    pub idempotency_key: Option<String>,
    pub supports_cancellation: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkUnit {
    pub work_unit_id: WorkUnitId,
    pub kind: WorkUnitKind,
    pub capability_id: String,
    pub title: String,
    pub dependencies: Vec<WorkDependency>,
    pub join_policy: JoinPolicy,
    pub execution_policy: ExecutionPolicy,
    pub input: Metadata,
    pub state: OperationState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskGraph {
    pub graph_id: TaskGraphId,
    pub session_id: SessionId,
    pub objective_id: ObjectiveId,
    pub plan_revision: u64,
    pub work_units: Vec<WorkUnit>,
    pub created_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeTerminalStatus {
    Succeeded,
    Failed,
    Cancelled,
    TimedOut,
    LegacyFallback,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeDiagnostic {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactEnvelope {
    pub artifact_id: ArtifactId,
    pub artifact_type: String,
    pub title: String,
    pub summary: String,
    pub body: Option<String>,
    pub items: Vec<Metadata>,
    pub status: ArtifactStatus,
    pub source_capability_id: String,
    pub source_references: Vec<String>,
    pub metadata: Metadata,
    pub created_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeEventKind {
    ObjectiveAccepted,
    PlanCreated,
    WorkUnitQueued,
    WorkUnitStarted,
    WorkUnitProgressed,
    WorkUnitCompleted,
    WorkUnitFailed,
    WorkUnitCancelled,
    ArtifactAdded,
    ApprovalRequired,
    ApprovalResolved,
    ConflictDetected,
    SnapshotRecovered,
    ExecutionCompleted,
    LegacyFallbackRequested,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    content = "data",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RuntimeEventPayload {
    ObjectiveAccepted {
        utterance: String,
        objective: String,
        routed_by: String,
    },
    PlanCreated {
        graph: TaskGraph,
        summary: String,
    },
    WorkUnitLifecycle {
        work_unit_id: WorkUnitId,
        state: OperationState,
        progress: u8,
        message: String,
    },
    ArtifactAdded {
        artifact: ArtifactEnvelope,
    },
    ApprovalRequired {
        approval: ApprovalRequest,
    },
    ApprovalResolved {
        approval_id: ApprovalId,
        decision: ApprovalDecision,
    },
    ConflictDetected {
        message: String,
        safe_diagnostic: SafeDiagnostic,
    },
    SnapshotRecovered {
        recovered_event_count: usize,
    },
    ExecutionCompleted {
        status: RuntimeTerminalStatus,
        summary: String,
    },
    LegacyFallbackRequested {
        reason: String,
    },
}

impl RuntimeEventPayload {
    pub fn kind(&self) -> RuntimeEventKind {
        match self {
            Self::ObjectiveAccepted { .. } => RuntimeEventKind::ObjectiveAccepted,
            Self::PlanCreated { .. } => RuntimeEventKind::PlanCreated,
            Self::WorkUnitLifecycle { state, .. } => match state {
                OperationState::Planned | OperationState::Ready => RuntimeEventKind::WorkUnitQueued,
                OperationState::Dispatched | OperationState::Acknowledged | OperationState::Running => {
                    RuntimeEventKind::WorkUnitStarted
                }
                OperationState::Succeeded | OperationState::PartiallySucceeded => {
                    RuntimeEventKind::WorkUnitCompleted
                }
                OperationState::Failed | OperationState::Expired => RuntimeEventKind::WorkUnitFailed,
                OperationState::Cancelled => RuntimeEventKind::WorkUnitCancelled,
                OperationState::Paused | OperationState::AwaitingApproval => {
                    RuntimeEventKind::WorkUnitProgressed
                }
            },
            Self::ArtifactAdded { .. } => RuntimeEventKind::ArtifactAdded,
            Self::ApprovalRequired { .. } => RuntimeEventKind::ApprovalRequired,
            Self::ApprovalResolved { .. } => RuntimeEventKind::ApprovalResolved,
            Self::ConflictDetected { .. } => RuntimeEventKind::ConflictDetected,
            Self::SnapshotRecovered { .. } => RuntimeEventKind::SnapshotRecovered,
            Self::ExecutionCompleted { status, .. } => match status {
                RuntimeTerminalStatus::LegacyFallback => RuntimeEventKind::LegacyFallbackRequested,
                _ => RuntimeEventKind::ExecutionCompleted,
            },
            Self::LegacyFallbackRequested { .. } => RuntimeEventKind::LegacyFallbackRequested,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventEnvelope {
    pub protocol_version: String,
    pub event_id: RuntimeEventId,
    pub sequence: u64,
    pub session_id: SessionId,
    pub objective_id: ObjectiveId,
    pub plan_revision: u64,
    pub graph_id: Option<TaskGraphId>,
    pub work_unit_id: Option<WorkUnitId>,
    pub run_id: RunId,
    pub occurred_at_ms: u64,
    pub payload: RuntimeEventPayload,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticRiskClass {
    SafeRead,
    LocalWrite,
    ExternalWrite,
    Destructive,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticCapabilityDescriptor {
    pub capability_id: String,
    pub provider_binding: String,
    pub input_contract: String,
    pub output_contract: String,
    pub availability: CapabilityAvailability,
    pub risk_class: SemanticRiskClass,
    pub approval_requirement: ApprovalRequirement,
    pub timeout_ms: u64,
    pub supports_cancellation: bool,
    pub idempotency_semantics: String,
    pub side_effect_class: SideEffectClass,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitObjectiveInput {
    pub utterance: String,
    pub session_id: Option<SessionId>,
    pub client_request_id: Option<String>,
    pub model_intent_hint: Option<String>,
    pub now_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Accepted,
    Running,
    Completed,
    FailedRetryable,
    FailedTerminal,
    Cancelled,
    TimedOut,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLedgerRecord {
    pub client_request_id: String,
    pub request_fingerprint: String,
    pub session_id: SessionId,
    pub objective_id: ObjectiveId,
    pub run_id: RunId,
    pub graph_id: Option<TaskGraphId>,
    pub plan_revision: u64,
    pub status: RequestStatus,
    pub accepted_at_ms: u64,
    pub terminal_at_ms: Option<u64>,
    pub safe_diagnostic: Option<SafeDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmitObjectiveRoute {
    Handled,
    LegacyFallback,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitObjectiveResponse {
    pub route: SubmitObjectiveRoute,
    pub session_id: SessionId,
    pub objective_id: ObjectiveId,
    pub run_id: RunId,
    pub graph_id: Option<TaskGraphId>,
    pub plan_revision: u64,
    pub accepted_sequence: u64,
    pub completed: bool,
    pub events: Vec<RuntimeEventEnvelope>,
    pub snapshot: ControlPlaneSessionSnapshot,
    pub pending_approvals: Vec<ApprovalRequest>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventsAfterInput {
    pub session_id: SessionId,
    pub after_sequence: u64,
    pub limit: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventsAfterResponse {
    pub session_id: SessionId,
    pub after_sequence: u64,
    pub next_sequence: u64,
    pub events: Vec<RuntimeEventEnvelope>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationCommand {
    pub session_id: SessionId,
    pub work_unit_id: WorkUnitId,
    pub plan_revision: u64,
    pub approval_id: Option<ApprovalId>,
    pub now_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlPlaneSessionSnapshot {
    pub protocol_version: String,
    pub session_id: SessionId,
    pub objective_id: Option<ObjectiveId>,
    pub active_graph_id: Option<TaskGraphId>,
    pub plan_revision: u64,
    pub next_sequence: u64,
    pub task_graphs: Vec<TaskGraph>,
    pub artifacts: Vec<ArtifactEnvelope>,
    pub pending_approvals: Vec<ApprovalRequest>,
    pub recent_events: Vec<RuntimeEventEnvelope>,
}
