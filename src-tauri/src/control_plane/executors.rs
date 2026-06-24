use super::contracts::*;
use super::authorization::AuthorizedOperation;
use crate::apple::mail;
use crate::apple::models::{AppleMailMessage, MailQuery};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

macro_rules! metadata {
    ($($key:expr => $value:expr),* $(,)?) => {{
        let mut values = Metadata::new();
        $(
            values.insert($key.to_string(), $value.to_string());
        )*
        values
    }};
}

pub trait MailMetadataProvider: Send + Sync {
    fn search(&self, limit: usize, unread_first: bool) -> Result<Vec<AppleMailMessage>, ControlPlaneError>;
}

pub struct AppleMailMetadataProvider;

impl MailMetadataProvider for AppleMailMetadataProvider {
    fn search(&self, limit: usize, unread_first: bool) -> Result<Vec<AppleMailMessage>, ControlPlaneError> {
        mail::load_mail_messages(MailQuery {
            limit: Some(limit),
            unread_first: Some(unread_first),
        })
        .map_err(|message| ControlPlaneError {
            kind: ControlPlaneErrorKind::ExecutorFailed,
            message: "mail metadata retrieval failed".to_string(),
            raw_diagnostic: Some(message),
            retryable: true,
        })
    }
}

#[derive(Clone)]
pub struct ExecutionContext {
    pub run_id: RunId,
    pub graph_id: TaskGraphId,
    pub work_unit_id: WorkUnitId,
    pub plan_revision: u64,
    pub cancellation: Arc<AtomicBool>,
    pub deadline: Instant,
    pub now_ms: u64,
}

impl ExecutionContext {
    pub fn is_cancelled(&self) -> bool {
        self.cancellation.load(Ordering::SeqCst)
    }
}

#[derive(Clone, Debug)]
pub enum ExecutorOutcome {
    MailMessages(Vec<AppleMailMessage>),
    TriageSummary(TriageSummary),
    Artifact(ArtifactEnvelope),
}

#[derive(Clone, Debug)]
pub struct TriageSummary {
    pub mode: EmailTriageMode,
    pub message_count: usize,
    pub unread_count: usize,
}

pub trait CapabilityExecutor: Send + Sync {
    fn capability_id(&self) -> &'static str;
    fn execute(
        &self,
        operation: &AuthorizedOperation,
        context: &ExecutionContext,
        prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
    ) -> Result<ExecutorOutcome, ControlPlaneError>;
}

#[derive(Clone)]
pub struct ExecutorRegistry {
    executors: BTreeMap<String, Arc<dyn CapabilityExecutor>>,
}

impl ExecutorRegistry {
    pub fn new(executors: Vec<Arc<dyn CapabilityExecutor>>) -> Self {
        let mut by_capability = BTreeMap::new();
        for executor in executors {
            by_capability.insert(executor.capability_id().to_string(), executor);
        }
        Self {
            executors: by_capability,
        }
    }

    pub fn inbox(mail_provider: Arc<dyn MailMetadataProvider>) -> Self {
        Self::new(vec![
            Arc::new(MailSearchExecutor { mail_provider }),
            Arc::new(TriageClassifyExecutor),
            Arc::new(ArtifactCreateExecutor),
        ])
    }

    pub fn get(&self, capability_id: &str) -> Option<Arc<dyn CapabilityExecutor>> {
        self.executors.get(capability_id).cloned()
    }

    pub fn contains(&self, capability_id: &str) -> bool {
        self.executors.contains_key(capability_id)
    }

    pub fn capability_descriptor(&self, capability_id: &str) -> Option<SemanticCapabilityDescriptor> {
        canonical_capabilities()
            .into_iter()
            .find(|descriptor| descriptor.capability_id == capability_id)
            .or_else(|| {
                self.contains(capability_id).then(|| fallback_capability_descriptor(capability_id))
            })
    }
}

struct MailSearchExecutor {
    mail_provider: Arc<dyn MailMetadataProvider>,
}

impl CapabilityExecutor for MailSearchExecutor {
    fn capability_id(&self) -> &'static str {
        "mail.search"
    }

    fn execute(
        &self,
        operation: &AuthorizedOperation,
        context: &ExecutionContext,
        _prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
    ) -> Result<ExecutorOutcome, ControlPlaneError> {
        let unit = operation.unit();
        if context.is_cancelled() {
            return Err(cancelled_error());
        }
        let limit = unit
            .input
            .get("limit")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(25)
            .min(50);
        let unread_first = unit
            .input
            .get("unreadFirst")
            .map(|value| value == "true")
            .unwrap_or(true);
        let messages = self.mail_provider.search(limit, unread_first)?;
        if context.is_cancelled() || Instant::now() > context.deadline {
            return Err(cancelled_error());
        }
        Ok(ExecutorOutcome::MailMessages(messages))
    }
}

struct TriageClassifyExecutor;

impl CapabilityExecutor for TriageClassifyExecutor {
    fn capability_id(&self) -> &'static str {
        "triage.classify"
    }

    fn execute(
        &self,
        operation: &AuthorizedOperation,
        context: &ExecutionContext,
        prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
    ) -> Result<ExecutorOutcome, ControlPlaneError> {
        let unit = operation.unit();
        if context.is_cancelled() || Instant::now() > context.deadline {
            return Err(cancelled_error());
        }
        let messages = first_mail_messages(prior_outcomes);
        let mode = unit
            .input
            .get("mode")
            .and_then(|value| EmailTriageMode::from_str(value))
            .unwrap_or(EmailTriageMode::CatchUp);
        let unread_count = messages
            .iter()
            .filter(|message| !message.is_read)
            .count();
        Ok(ExecutorOutcome::TriageSummary(TriageSummary {
            mode,
            message_count: messages.len(),
            unread_count,
        }))
    }
}

struct ArtifactCreateExecutor;

impl CapabilityExecutor for ArtifactCreateExecutor {
    fn capability_id(&self) -> &'static str {
        "artifact.create"
    }

    fn execute(
        &self,
        operation: &AuthorizedOperation,
        context: &ExecutionContext,
        prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
    ) -> Result<ExecutorOutcome, ControlPlaneError> {
        let unit = operation.unit();
        if context.is_cancelled() || Instant::now() > context.deadline {
            return Err(cancelled_error());
        }
        let messages = first_mail_messages(prior_outcomes);
        let triage_summary = prior_outcomes
            .values()
            .find_map(|outcome| match outcome {
                ExecutorOutcome::TriageSummary(summary) => Some(summary.clone()),
                _ => None,
            });
        let mode = triage_summary
            .as_ref()
            .map(|summary| summary.mode)
            .or_else(|| unit.input.get("mode").and_then(|value| EmailTriageMode::from_str(value)))
            .unwrap_or(EmailTriageMode::CatchUp);
        let utterance = unit
            .input
            .get("utterance")
            .cloned()
            .unwrap_or_else(|| "Inbox triage".to_string());
        let mut artifact = build_inbox_triage_artifact(
            ArtifactId::new(format!(
                "artifact-{}-{}",
                context.now_ms,
                context.work_unit_id.as_str()
            )),
            &utterance,
            mode,
            &messages,
            context.now_ms,
        );
        artifact
            .metadata
            .insert("runId".to_string(), context.run_id.to_string());
        artifact
            .metadata
            .insert("graphId".to_string(), context.graph_id.to_string());
        artifact
            .metadata
            .insert("planRevision".to_string(), context.plan_revision.to_string());
        if let Some(summary) = triage_summary {
            artifact
                .metadata
                .insert("triagedMessageCount".to_string(), summary.message_count.to_string());
            artifact
                .metadata
                .insert("triagedUnreadCount".to_string(), summary.unread_count.to_string());
        }
        Ok(ExecutorOutcome::Artifact(artifact))
    }
}

fn first_mail_messages(prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>) -> Vec<AppleMailMessage> {
    prior_outcomes
        .values()
        .find_map(|outcome| match outcome {
            ExecutorOutcome::MailMessages(messages) => Some(messages.clone()),
            _ => None,
        })
        .unwrap_or_default()
}

fn cancelled_error() -> ControlPlaneError {
    ControlPlaneError {
        kind: ControlPlaneErrorKind::InvalidTransition,
        message: "execution was cancelled or expired before completion".to_string(),
        raw_diagnostic: None,
        retryable: false,
    }
}

pub fn canonical_capabilities() -> Vec<SemanticCapabilityDescriptor> {
    vec![
        SemanticCapabilityDescriptor {
            capability_id: "mail.search".to_string(),
            provider_binding: "apple-mail-envelope-index".to_string(),
            input_contract: "control-plane.mail-search.input.v1".to_string(),
            output_contract: "control-plane.mail-metadata-list.v1".to_string(),
            operation_kind: OperationKind::Read,
            read_or_write: ReadOrWrite::Read,
            availability: CapabilityAvailability::Available,
            risk_class: SemanticRiskClass::SafeRead,
            approval_requirement: ApprovalRequirement::None,
            timeout_ms: 5_000,
            supports_cancellation: true,
            idempotency_semantics: "metadata read only; safe to retry".to_string(),
            side_effect_class: SideEffectClass::None,
            reversibility: "no mutation".to_string(),
            required_permissions: vec!["apple_mail_metadata_read".to_string()],
        },
        SemanticCapabilityDescriptor {
            capability_id: "triage.classify".to_string(),
            provider_binding: "deterministic-local-triage".to_string(),
            input_contract: "control-plane.mail-metadata-list.v1".to_string(),
            output_contract: "control-plane.triage-summary.v1".to_string(),
            operation_kind: OperationKind::Read,
            read_or_write: ReadOrWrite::Read,
            availability: CapabilityAvailability::Available,
            risk_class: SemanticRiskClass::SafeRead,
            approval_requirement: ApprovalRequirement::None,
            timeout_ms: 2_000,
            supports_cancellation: true,
            idempotency_semantics: "pure deterministic classification".to_string(),
            side_effect_class: SideEffectClass::None,
            reversibility: "no mutation".to_string(),
            required_permissions: Vec::new(),
        },
        SemanticCapabilityDescriptor {
            capability_id: "artifact.create".to_string(),
            provider_binding: "in-app-surface-artifact".to_string(),
            input_contract: "control-plane.triage-summary.v1".to_string(),
            output_contract: "control-plane.artifact-envelope.v1".to_string(),
            operation_kind: OperationKind::PrepareDraft,
            read_or_write: ReadOrWrite::Write,
            availability: CapabilityAvailability::Available,
            risk_class: SemanticRiskClass::LocalWrite,
            approval_requirement: ApprovalRequirement::None,
            timeout_ms: 2_000,
            supports_cancellation: true,
            idempotency_semantics: "local in-app artifact projection; no disk write".to_string(),
            side_effect_class: SideEffectClass::LocalReversible,
            reversibility: "local artifact can be discarded".to_string(),
            required_permissions: Vec::new(),
        },
    ]
}

fn fallback_capability_descriptor(capability_id: &str) -> SemanticCapabilityDescriptor {
    SemanticCapabilityDescriptor {
        capability_id: capability_id.to_string(),
        provider_binding: "test-or-local-executor".to_string(),
        input_contract: "control-plane.fallback.input.v1".to_string(),
        output_contract: "control-plane.fallback.output.v1".to_string(),
        operation_kind: OperationKind::Read,
        read_or_write: ReadOrWrite::Read,
        availability: CapabilityAvailability::Available,
        risk_class: SemanticRiskClass::SafeRead,
        approval_requirement: ApprovalRequirement::None,
        timeout_ms: 5_000,
        supports_cancellation: true,
        idempotency_semantics: "fallback descriptor for registered local executor".to_string(),
        side_effect_class: SideEffectClass::None,
        reversibility: "no mutation declared".to_string(),
        required_permissions: Vec::new(),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EmailTriageMode {
    CatchUp,
    ExtractRecords,
    OrganizeContext,
    CompareOptions,
    PlanNextSteps,
    DraftArtifact,
    ReviewApproval,
    CoordinateAction,
    TrackStatus,
}

impl EmailTriageMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::CatchUp => "catch_up",
            Self::ExtractRecords => "extract_records",
            Self::OrganizeContext => "organize_context",
            Self::CompareOptions => "compare_options",
            Self::PlanNextSteps => "plan_next_steps",
            Self::DraftArtifact => "draft_artifact",
            Self::ReviewApproval => "review_approval",
            Self::CoordinateAction => "coordinate_action",
            Self::TrackStatus => "track_status",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "catch_up" => Some(Self::CatchUp),
            "extract_records" => Some(Self::ExtractRecords),
            "organize_context" => Some(Self::OrganizeContext),
            "compare_options" => Some(Self::CompareOptions),
            "plan_next_steps" => Some(Self::PlanNextSteps),
            "draft_artifact" => Some(Self::DraftArtifact),
            "review_approval" => Some(Self::ReviewApproval),
            "coordinate_action" => Some(Self::CoordinateAction),
            "track_status" => Some(Self::TrackStatus),
            _ => None,
        }
    }
}

pub fn build_inbox_triage_graph(
    graph_id: TaskGraphId,
    session_id: SessionId,
    objective_id: ObjectiveId,
    plan_revision: u64,
    now_ms: u64,
    utterance: &str,
    mode: EmailTriageMode,
    mail_unit_id: WorkUnitId,
    classify_unit_id: WorkUnitId,
    artifact_unit_id: WorkUnitId,
) -> TaskGraph {
    TaskGraph {
        graph_id,
        session_id,
        objective_id,
        plan_revision,
        created_at_ms: now_ms,
        work_units: vec![
            WorkUnit {
                work_unit_id: mail_unit_id.clone(),
                kind: WorkUnitKind::MailSearch,
                capability_id: "mail.search".to_string(),
                title: "Load inbox metadata".to_string(),
                dependencies: Vec::new(),
                join_policy: JoinPolicy::AllSucceeded,
                execution_policy: read_policy(format!("mail.search:{plan_revision}")),
                input: metadata! {
                    "utterance" => utterance,
                    "limit" => "25",
                    "unreadFirst" => "true",
                    "instructionAuthority" => "user_directive",
                    "dataSensitivity" => "local",
                    "destination" => "local_process",
                },
                state: OperationState::Planned,
            },
            WorkUnit {
                work_unit_id: classify_unit_id.clone(),
                kind: WorkUnitKind::TriageClassify,
                capability_id: "triage.classify".to_string(),
                title: "Classify inbox triage signals".to_string(),
                dependencies: vec![WorkDependency {
                    upstream_work_unit_id: mail_unit_id,
                    dependency_kind: DependencyKind::RequiresSuccess,
                }],
                join_policy: JoinPolicy::AllSucceeded,
                execution_policy: read_policy(format!("triage.classify:{plan_revision}")),
                input: metadata! {
                    "mode" => mode.as_str(),
                    "instructionAuthority" => "derived_data",
                    "dataSensitivity" => "local",
                    "destination" => "local_process",
                },
                state: OperationState::Planned,
            },
            WorkUnit {
                work_unit_id: artifact_unit_id,
                kind: WorkUnitKind::ArtifactCreate,
                capability_id: "artifact.create".to_string(),
                title: "Create in-app inbox triage artifact".to_string(),
                dependencies: vec![WorkDependency {
                    upstream_work_unit_id: classify_unit_id,
                    dependency_kind: DependencyKind::RequiresSuccess,
                }],
                join_policy: JoinPolicy::AllSucceeded,
                execution_policy: ExecutionPolicy {
                    timeout_ms: 2_000,
                    approval_requirement: ApprovalRequirement::None,
                    side_effect_class: SideEffectClass::LocalReversible,
                    retry_policy: RetryPolicy {
                        max_attempts: 1,
                        retry_idempotent_only: true,
                    },
                    idempotency_key: Some(format!("artifact.create:{plan_revision}:{}", mode.as_str())),
                    supports_cancellation: true,
                },
                input: metadata! {
                    "mode" => mode.as_str(),
                    "utterance" => utterance,
                    "writesToDisk" => "false",
                    "instructionAuthority" => "user_directive",
                    "dataSensitivity" => "local",
                    "destination" => "local_process",
                },
                state: OperationState::Planned,
            },
        ],
    }
}

fn read_policy(idempotency_key: String) -> ExecutionPolicy {
    ExecutionPolicy {
        timeout_ms: 5_000,
        approval_requirement: ApprovalRequirement::None,
        side_effect_class: SideEffectClass::None,
        retry_policy: RetryPolicy {
            max_attempts: 1,
            retry_idempotent_only: true,
        },
        idempotency_key: Some(idempotency_key),
        supports_cancellation: true,
    }
}

pub fn build_inbox_triage_artifact(
    artifact_id: ArtifactId,
    utterance: &str,
    mode: EmailTriageMode,
    messages: &[AppleMailMessage],
    now_ms: u64,
) -> ArtifactEnvelope {
    let unread = messages.iter().filter(|message| !message.is_read).count();
    let title = email_triage_title(mode).to_string();
    let summary = if messages.is_empty() {
        "Apple Mail returned no messages to triage.".to_string()
    } else {
        format!(
            "Created a read-only inbox triage artifact from {} Apple Mail metadata rows.",
            messages.len()
        )
    };
    let mut artifact_metadata = metadata! {
        "source" => "Apple Mail metadata",
        "mailCount" => messages.len(),
        "unreadCount" => unread,
        "writesToDisk" => "false",
        "externalWrite" => "false",
        "writesToMailbox" => "false",
        "fullBodiesRead" => "false",
        "mode" => mode.as_str(),
    };
    artifact_metadata.insert("command".to_string(), utterance.to_string());

    ArtifactEnvelope {
        artifact_id,
        artifact_type: "text/markdown".to_string(),
        title,
        summary,
        body: Some(email_triage_body(utterance, messages, mode)),
        items: messages.iter().take(12).map(mail_item_metadata).collect(),
        status: ArtifactStatus::DerivedInterpretation,
        source_capability_id: "artifact.create".to_string(),
        source_references: messages.iter().take(12).map(|message| message.id.clone()).collect(),
        metadata: artifact_metadata,
        created_at_ms: now_ms,
    }
}

fn mail_item_metadata(message: &AppleMailMessage) -> Metadata {
    metadata! {
        "id" => message.id.clone(),
        "subject" => message.subject.clone(),
        "sender" => message.sender.clone(),
        "mailbox" => message.mailbox.clone(),
        "isRead" => message.is_read,
        "receivedAt" => message.received_at.clone().unwrap_or_else(|| "unknown".to_string()),
        "preview" => message
            .preview
            .clone()
            .unwrap_or_else(|| "Metadata row only. Full body was not read.".to_string()),
    }
}

fn email_triage_title(mode: EmailTriageMode) -> &'static str {
    match mode {
        EmailTriageMode::PlanNextSteps => "Inbox triage plan",
        EmailTriageMode::DraftArtifact => "Inbox triage draft",
        EmailTriageMode::ReviewApproval => "Inbox triage review",
        EmailTriageMode::CoordinateAction => "Inbox triage action",
        EmailTriageMode::TrackStatus => "Inbox triage status",
        EmailTriageMode::ExtractRecords => "Inbox triage records",
        EmailTriageMode::OrganizeContext => "Inbox triage context",
        EmailTriageMode::CompareOptions => "Inbox triage options",
        EmailTriageMode::CatchUp => "Inbox triage catch-up",
    }
}

fn email_triage_body(utterance: &str, messages: &[AppleMailMessage], mode: EmailTriageMode) -> String {
    let unread = messages.iter().filter(|message| !message.is_read).count();
    let top_subjects = messages
        .iter()
        .take(5)
        .map(|message| format!("- {} from {}", message.subject, message.sender))
        .collect::<Vec<_>>()
        .join("\n");
    let top_subjects = if top_subjects.is_empty() {
        "- No Mail metadata rows were available.".to_string()
    } else {
        top_subjects
    };
    let mode_body = match mode {
        EmailTriageMode::DraftArtifact => "## Draft Artifact\nDraft status: preview only. This is an in-app artifact and was not written to disk.\n\n## First Version\nUse the metadata rows below to decide which message to open or summarize next.\n\nApproval boundary: no reply, send, archive, delete, or mailbox change has been performed.",
        EmailTriageMode::ReviewApproval => "## Review and Approval Check\nApproval status: not approved. This pass reviews metadata only.\n\n## Findings\nThe result can flag likely priorities, but cannot prove body-level commitments.\n\n## Proposed Corrections\nOpen or summarize a specific message before acting on it.",
        EmailTriageMode::CoordinateAction => "## Action Coordination Preview\nExecution status: not executed. The control plane prepared a coordination view only.\n\n## Required Confirmation\nExternal, irreversible, or high-impact steps require a separate approval record.\n\n## Result, Exceptions, and Rollback\nNo external result exists and no rollback is required because nothing was mutated.",
        EmailTriageMode::TrackStatus => "## Status and Exceptions View\nThis is a metadata-only status pass.\n\n## Explicit Thresholds\nUnread threshold: review unread messages before read messages.\n\n## Emerging Exceptions\nMessages with payment, approval, or deadline wording should be opened before action.\n\n## Trends and Follow-Ups\nUse this as a queue, not as final evidence.",
        EmailTriageMode::PlanNextSteps => "## Operating Plan\nOwner: user reviews and chooses the next message.\n\nFallback path: if metadata is insufficient, open one message fully.\n\n## Assumptions\nOnly Mail metadata was used.\n\n## Gaps\nFull message bodies and thread history were not read.\n\n## Next Steps\nPick one item to open, summarize, or turn into a draft.",
        EmailTriageMode::ExtractRecords => "## Key Records\nMetadata rows are grouped as candidate records only.\n\n## Open Requests\nOpen a specific message before treating a request as authoritative.",
        EmailTriageMode::OrganizeContext => "## Organized Context\nThe inbox queue is organized from recent Mail metadata.\n\n## Boundaries\nThis view does not read full message bodies.",
        EmailTriageMode::CompareOptions => "## Options\nCompare by sender, unread status, and subject wording.\n\n## Decision Boundary\nOpen the selected message before committing to an action.",
        EmailTriageMode::CatchUp => "## Catch-Up\nRecent inbox metadata was scanned for a first-pass triage view.\n\n## Boundary\nNo full bodies, replies, sends, archives, deletes, or labels were touched.",
    };

    format!(
        "# {}\n\nCommand: {}\n\n## Sources Used\nApple Mail metadata only. Full bodies read: false. Mailbox writes: false.\n\n## Counts\n- Rows checked: {}\n- Unread rows: {}\n\n{}\n\n## Candidate Messages\n{}",
        email_triage_title(mode),
        utterance,
        messages.len(),
        unread,
        mode_body,
        top_subjects
    )
}

pub fn infer_email_triage_mode(utterance: &str) -> EmailTriageMode {
    let text = utterance.to_ascii_lowercase();
    if contains_any(&text, &["review", "approve", "approval", "proposed work", "quality", "risk", "criteria", "defect", "omission", "uncertainty", "correction"]) {
        return EmailTriageMode::ReviewApproval;
    }
    if contains_any(&text, &["track", "progress", "exception", "status", "signal", "threshold", "trend", "follow-up", "stale", "noise", "alert", "remediation"]) {
        return EmailTriageMode::TrackStatus;
    }
    if contains_any(&text, &["coordinate", "carry out", "approved action", "requested action", "execute", "execution", "confirm", "rollback", "external", "irreversible", "high impact"]) {
        return EmailTriageMode::CoordinateAction;
    }
    if contains_any(&text, &["draft", "artifact", "version", "configuration", "calculation"]) {
        return EmailTriageMode::DraftArtifact;
    }
    if contains_any(&text, &["compare", "option"]) {
        return EmailTriageMode::CompareOptions;
    }
    if contains_any(&text, &["plan", "next step", "actionable"]) {
        return EmailTriageMode::PlanNextSteps;
    }
    if contains_any(&text, &["organize", "context"]) {
        return EmailTriageMode::OrganizeContext;
    }
    if contains_any(&text, &["decision", "record", "request", "key"]) {
        return EmailTriageMode::ExtractRecords;
    }
    EmailTriageMode::CatchUp
}

pub fn is_inbox_triage_utterance(utterance: &str) -> bool {
    let text = utterance.to_ascii_lowercase();
    text.contains("inbox triage")
        || (text.contains("triage") && contains_any(&text, &["inbox", "email", "mail"]))
}

pub fn objective_from_utterance(utterance: &str) -> String {
    if is_inbox_triage_utterance(utterance) {
        "Run read-only inbox triage".to_string()
    } else {
        utterance.to_string()
    }
}

fn contains_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

#[cfg(test)]
pub struct FixtureMailMetadataProvider {
    pub messages: Vec<AppleMailMessage>,
}

#[cfg(test)]
impl MailMetadataProvider for FixtureMailMetadataProvider {
    fn search(&self, _limit: usize, _unread_first: bool) -> Result<Vec<AppleMailMessage>, ControlPlaneError> {
        Ok(self.messages.clone())
    }
}
