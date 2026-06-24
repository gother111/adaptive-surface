use super::contracts::*;
use super::data_guard::redact_metadata_values;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

const DEFAULT_NOW_MS: u64 = 1_782_000_000_000;
const CONTEXT_TTL_MS: u64 = 30_000;
const APPROVAL_TTL_MS: u64 = 300_000;
const MAX_OPERATION_COUNT: usize = 3;

#[derive(Default)]
struct IdSequence {
    next: u64,
}

impl IdSequence {
    fn id(&mut self, prefix: &str) -> String {
        self.next = self.next.saturating_add(1);
        format!("{prefix}-{:04}", self.next)
    }
}

struct ActivityLog {
    events: Vec<ActivityEvent>,
    seen_provider_events: BTreeSet<String>,
    next_sequence_by_operation: BTreeMap<String, u64>,
}

impl ActivityLog {
    fn new() -> Self {
        Self {
            events: Vec::new(),
            seen_provider_events: BTreeSet::new(),
            next_sequence_by_operation: BTreeMap::new(),
        }
    }

    fn record(
        &mut self,
        ids: &mut IdSequence,
        now_ms: u64,
        session_id: &str,
        plan_id: &str,
        operation_id: &str,
        provider_event_id: Option<String>,
        state: OperationState,
        progress: u8,
        message: impl Into<String>,
        required_intervention: Option<String>,
        error: Option<ControlPlaneError>,
    ) {
        if let Some(provider_event_id) = &provider_event_id {
            if !self.seen_provider_events.insert(provider_event_id.clone()) {
                return;
            }
        }

        let sequence = self
            .next_sequence_by_operation
            .entry(operation_id.to_string())
            .and_modify(|value| *value = value.saturating_add(1))
            .or_insert(1);

        self.events.push(ActivityEvent {
            activity_event_id: ids.id("activity"),
            provider_event_id,
            sequence: *sequence,
            occurred_at_ms: now_ms,
            session_id: session_id.to_string(),
            plan_id: plan_id.to_string(),
            operation_id: operation_id.to_string(),
            state,
            progress,
            message: message.into(),
            partial_artifacts: Vec::new(),
            required_intervention,
            error,
            provenance: provenance("activity-log", now_ms, vec!["normalized executor event"]),
        });
    }

}

struct DispatchLedger {
    dispatched_operations: BTreeSet<String>,
}

impl DispatchLedger {
    fn new() -> Self {
        Self {
            dispatched_operations: BTreeSet::new(),
        }
    }

    fn dispatch(&mut self, operation: &mut DelegatedOperation) -> Result<(), ControlPlaneError> {
        if !valid_transition(
            &operation.state,
            &OperationState::Dispatched,
            operation.idempotency_key.is_some(),
        ) {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                format!("operation {} is not ready to dispatch", operation.operation_id),
            ));
        }

        if !self.dispatched_operations.insert(operation.operation_id.clone()) {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::DuplicateDispatch,
                format!("operation {} was already dispatched", operation.operation_id),
            ));
        }

        operation.state = OperationState::Dispatched;
        Ok(())
    }
}

pub fn run_control_plane_demo(
    input: ControlPlaneDemoInput,
) -> Result<ControlPlaneRunResult, ControlPlaneError> {
    let mut ids = IdSequence::default();
    let now_ms = input.now_ms.unwrap_or(DEFAULT_NOW_MS);
    let objective = input.objective.clone().unwrap_or_else(|| {
        "Summarize this selected context and prepare the proposed follow-up for approval"
            .to_string()
    });

    let observation = build_observation(&mut ids, &input, now_ms);
    let context_snapshot = build_context_snapshot(&mut ids, &observation, now_ms);
    let intent = resolve_intent(&mut ids, &objective, &context_snapshot, None, now_ms);
    let capability_registry = default_capability_registry();
    let target_bindings = resolve_targets(&mut ids, &intent, &context_snapshot, &capability_registry)?;
    let mut plan = build_plan(&mut ids, &intent, &target_bindings, now_ms)?;
    let mut activity_log = ActivityLog::new();
    let mut approval_requests =
        apply_policy(&mut ids, &mut plan, &capability_registry, &intent, now_ms)?;
    let mut artifacts = Vec::new();
    let mut receipts = Vec::new();
    let mut ledger = DispatchLedger::new();
    let mut verified_non_execution = false;

    dispatch_ready_reads(
        &mut ids,
        &mut ledger,
        &mut activity_log,
        &mut plan,
        &context_snapshot,
        &mut artifacts,
        now_ms,
        2,
    )?;

    if let Some(decision) = input.approval_decision {
        if let Some(approval_request) = approval_requests.first() {
            let operation = plan
                .steps
                .iter_mut()
                .find(|step| step.operation_id == approval_request.operation_id)
                .ok_or_else(|| {
                    ControlPlaneError::new(
                        ControlPlaneErrorKind::PolicyBlocked,
                        "approval request referenced an operation that no longer exists",
                    )
                })?;

            match decision {
                ApprovalDecision::Approve => {
                    approve_operation(operation, approval_request, plan.revision)?;
                    execute_approved_mutation(
                        &mut ids,
                        &mut ledger,
                        &mut activity_log,
                        operation,
                        &mut receipts,
                        now_ms,
                    )?;
                }
                ApprovalDecision::Reject => {
                    reject_operation(&mut ids, &mut activity_log, operation, now_ms);
                    verified_non_execution = true;
                }
                ApprovalDecision::Cancel => {
                    cancel_operation(&mut ids, &mut activity_log, operation, now_ms);
                    verified_non_execution = true;
                }
            }
        }
    }

    let recovery_snapshot = RecoverySnapshot {
        snapshot_id: ids.id("recovery"),
        captured_at_ms: now_ms,
        context_snapshot: context_snapshot.clone(),
        plan: plan.clone(),
        activity_events: activity_log.events.clone(),
        approval_requests: approval_requests.clone(),
        artifacts: artifacts.clone(),
        receipts: receipts.clone(),
    };
    let recovery_report = reconcile_after_restart(&recovery_snapshot, now_ms.saturating_add(1));

    Ok(ControlPlaneRunResult {
        observation,
        context_snapshot,
        intent,
        capability_registry,
        target_bindings,
        plan,
        activity_events: activity_log.events,
        approval_requests: std::mem::take(&mut approval_requests),
        artifacts,
        receipts,
        recovery_snapshot,
        recovery_report,
        verified_non_execution,
    })
}

fn build_observation(
    ids: &mut IdSequence,
    input: &ControlPlaneDemoInput,
    now_ms: u64,
) -> ObservationEvent {
    let mut metadata = Metadata::new();
    metadata.insert(
        "selectedText".to_string(),
        input
            .selected_text
            .clone()
            .unwrap_or_else(|| "Selected local context was not provided.".to_string()),
    );

    ObservationEvent {
        event_id: ids.id("observation"),
        observed_at_ms: now_ms,
        source: ObservationSource::Synthetic,
        app: input
            .active_app
            .clone()
            .unwrap_or_else(|| "Synthetic Fixture".to_string()),
        window: input
            .active_window
            .clone()
            .unwrap_or_else(|| "Control Plane Smoke Test".to_string()),
        object_reference: Some("active-window".to_string()),
        selection_reference: Some("selected-text".to_string()),
        event_kind: ObservationEventKind::UserObjectiveReceived,
        metadata,
        freshness: Freshness::fresh(now_ms, CONTEXT_TTL_MS),
        sensitivity: Sensitivity::Local,
        confidence: 100,
    }
}

fn build_context_snapshot(
    ids: &mut IdSequence,
    observation: &ObservationEvent,
    now_ms: u64,
) -> ContextSnapshot {
    let window_reference_id = ids.id("context");
    let selection_reference_id = ids.id("context");
    let selected_text = observation
        .metadata
        .get("selectedText")
        .cloned()
        .unwrap_or_else(|| "Selected local context was not provided.".to_string());

    ContextSnapshot {
        snapshot_id: ids.id("snapshot"),
        revision: 1,
        focus_context: vec![
            ContextReference {
                reference_id: window_reference_id,
                source_system: observation.app.clone(),
                object_type: ObjectType::ActiveWindow,
                external_id: observation.object_reference.clone(),
                uri_or_locator: Some(observation.window.clone()),
                version_or_etag: Some(format!("observed-{}", observation.observed_at_ms)),
                observed_at_ms: observation.observed_at_ms,
                freshness: Freshness::fresh(now_ms, CONTEXT_TTL_MS),
                sensitivity: Sensitivity::Local,
                provenance: provenance(
                    "context-sensor",
                    now_ms,
                    vec![format!("active app: {}", observation.app)],
                ),
            },
            ContextReference {
                reference_id: selection_reference_id,
                source_system: observation.app.clone(),
                object_type: ObjectType::SelectedText,
                external_id: observation.selection_reference.clone(),
                uri_or_locator: Some(selected_text),
                version_or_etag: Some(format!("observed-{}", observation.observed_at_ms)),
                observed_at_ms: observation.observed_at_ms,
                freshness: Freshness::fresh(now_ms, CONTEXT_TTL_MS),
                sensitivity: Sensitivity::Local,
                provenance: provenance(
                    "context-sensor",
                    now_ms,
                    vec!["bounded selected text reference".to_string()],
                ),
            },
        ],
        session_context: Vec::new(),
        related_context: Vec::new(),
        unresolved_references: Vec::new(),
        created_at_ms: now_ms,
    }
}

fn resolve_reference<'a>(
    phrase: &str,
    snapshot: &'a ContextSnapshot,
) -> Option<&'a ContextReference> {
    let normalized = phrase.to_ascii_lowercase();
    let wants_focus = ["this", "these", "latest one", "selected", "send it there"]
        .iter()
        .any(|needle| normalized.contains(needle));

    if !wants_focus {
        return None;
    }

    snapshot
        .focus_context
        .iter()
        .find(|reference| reference.object_type == ObjectType::SelectedText)
        .or_else(|| snapshot.focus_context.first())
        .or_else(|| snapshot.session_context.first())
}

fn resolve_intent(
    ids: &mut IdSequence,
    objective: &str,
    snapshot: &ContextSnapshot,
    previous: Option<&IntentFrame>,
    now_ms: u64,
) -> IntentFrame {
    let lower = objective.to_ascii_lowercase();
    let workflow_family = if lower.contains("mail") || lower.contains("email") || lower.contains("send") {
        WorkflowFamily::Communication
    } else if lower.contains("calendar") || lower.contains("meeting") {
        WorkflowFamily::Calendar
    } else if lower.contains("file") || lower.contains("document") {
        WorkflowFamily::File
    } else if lower.contains("surface") || lower.contains("view") {
        WorkflowFamily::Surface
    } else {
        WorkflowFamily::General
    };

    let commitment = if lower.contains("send") || lower.contains("commit") || lower.contains("create event") {
        CommitmentTier::Commit
    } else if lower.contains("propose") || lower.contains("prepare") || lower.contains("draft") {
        CommitmentTier::Propose
    } else {
        CommitmentTier::Observe
    };

    let risk = match commitment {
        CommitmentTier::Commit => RiskLevel::ExternalWrite,
        CommitmentTier::Prepare | CommitmentTier::Propose => RiskLevel::LocalWrite,
        CommitmentTier::Observe => RiskLevel::SafeRead,
    };

    let lifecycle_stage = match commitment {
        CommitmentTier::Commit => LifecycleStage::Commit,
        CommitmentTier::Propose => LifecycleStage::Review,
        CommitmentTier::Prepare => LifecycleStage::Draft,
        CommitmentTier::Observe => LifecycleStage::Discover,
    };

    let subject_reference = resolve_reference(objective, snapshot);
    let mut confidence_by_field = BTreeMap::new();
    confidence_by_field.insert("objective".to_string(), 88);
    confidence_by_field.insert("workflowFamily".to_string(), 76);
    confidence_by_field.insert("commitment".to_string(), 82);
    confidence_by_field.insert(
        "subject".to_string(),
        if subject_reference.is_some() { 86 } else { 40 },
    );

    let bindings = subject_reference
        .map(|reference| {
            vec![IntentBinding {
                slot: "subject".to_string(),
                reference_id: reference.reference_id.clone(),
                confidence: 86,
            }]
        })
        .unwrap_or_default();

    let mut alternative_hypotheses = previous
        .map(|intent| intent.alternative_hypotheses.clone())
        .unwrap_or_default();
    if subject_reference.is_none() && lower.contains("this") {
        alternative_hypotheses.push(IntentAlternative {
            objective: objective.to_string(),
            reason: "Pronoun reference could not be resolved against the current focus context."
                .to_string(),
            confidence: 41,
        });
    }

    IntentFrame {
        intent_id: previous
            .map(|intent| intent.intent_id.clone())
            .unwrap_or_else(|| ids.id("intent")),
        session_id: previous
            .map(|intent| intent.session_id.clone())
            .unwrap_or_else(|| ids.id("session")),
        objective: objective.to_string(),
        subject: subject_reference.and_then(|reference| reference.uri_or_locator.clone()),
        workflow_family,
        lifecycle_stage,
        desired_output: Some("normalized control-plane result".to_string()),
        bindings,
        scope: IntentScope {
            bounded_to_snapshot: snapshot.snapshot_id.clone(),
            target_apps: snapshot
                .focus_context
                .iter()
                .map(|reference| reference.source_system.clone())
                .collect(),
            max_operations: MAX_OPERATION_COUNT,
        },
        commitment,
        risk,
        constraints: vec![
            "no direct model-to-OS execution".to_string(),
            "external systems remain authoritative".to_string(),
            "mutations require policy evaluation".to_string(),
        ],
        confidence_by_field,
        alternative_hypotheses,
        context_snapshot_id: snapshot.snapshot_id.clone(),
        provenance: provenance("intent-resolver", now_ms, vec!["deterministic local fallback"]),
    }
}

fn default_capability_registry() -> Vec<CapabilityDescriptor> {
    vec![
        CapabilityDescriptor {
            capability_id: "context.read".to_string(),
            provider_id: "deterministic-context-executor".to_string(),
            target_kinds: vec![ObjectType::SelectedText, ObjectType::ActiveWindow],
            operation_kind: OperationKind::Read,
            input_schema: "control-plane.context.read.v1".to_string(),
            output_schema: "control-plane.normalized-artifact.v1".to_string(),
            read_or_write: ReadOrWrite::Read,
            side_effect_class: SideEffectClass::None,
            reversibility: "no mutation".to_string(),
            required_permissions: vec!["existing local context permission".to_string()],
            supports_cancellation: true,
            supports_idempotency: true,
            expected_latency: "local-fast".to_string(),
            availability: CapabilityAvailability::Available,
            provenance_guarantee: "source reference linked to artifact".to_string(),
        },
        CapabilityDescriptor {
            capability_id: "surface.prepare_projection".to_string(),
            provider_id: "presentation-projection-port".to_string(),
            target_kinds: vec![ObjectType::NormalizedArtifact],
            operation_kind: OperationKind::PrepareDraft,
            input_schema: "control-plane.projection.prepare.v1".to_string(),
            output_schema: "control-plane.normalized-artifact.v1".to_string(),
            read_or_write: ReadOrWrite::Write,
            side_effect_class: SideEffectClass::LocalReversible,
            reversibility: "local projection can be discarded".to_string(),
            required_permissions: Vec::new(),
            supports_cancellation: true,
            supports_idempotency: true,
            expected_latency: "local-fast".to_string(),
            availability: CapabilityAvailability::Available,
            provenance_guarantee: "prepared artifact remains local".to_string(),
        },
        CapabilityDescriptor {
            capability_id: "mail.send".to_string(),
            provider_id: "external-mail-adapter-port".to_string(),
            target_kinds: vec![ObjectType::SelectedText],
            operation_kind: OperationKind::MutateExternal,
            input_schema: "control-plane.mail.send-request.v1".to_string(),
            output_schema: "control-plane.execution-receipt.v1".to_string(),
            read_or_write: ReadOrWrite::Write,
            side_effect_class: SideEffectClass::ExternalConsequential,
            reversibility: "not reliably reversible after provider accepts send".to_string(),
            required_permissions: vec!["mail account approval".to_string()],
            supports_cancellation: false,
            supports_idempotency: false,
            expected_latency: "external-provider".to_string(),
            availability: CapabilityAvailability::Available,
            provenance_guarantee: "requires provider receipt or verified non-execution".to_string(),
        },
    ]
}

fn resolve_targets(
    ids: &mut IdSequence,
    intent: &IntentFrame,
    snapshot: &ContextSnapshot,
    registry: &[CapabilityDescriptor],
) -> Result<Vec<TargetBinding>, ControlPlaneError> {
    let read_descriptor = require_capability(registry, "context.read")?;
    let subject_reference = intent
        .bindings
        .iter()
        .find(|binding| binding.slot == "subject")
        .map(|binding| binding.reference_id.clone())
        .or_else(|| snapshot.focus_context.first().map(|reference| reference.reference_id.clone()));

    let mut bindings = vec![TargetBinding {
        target_id: ids.id("target"),
        source_system: "control-plane".to_string(),
        app_or_service: read_descriptor.provider_id.clone(),
        object_reference: subject_reference.clone(),
        capability_id: read_descriptor.capability_id.clone(),
        resolution_confidence: 90,
        resolution_reason: "focus context can be summarized through a declared read capability"
            .to_string(),
    }];

    if intent.commitment >= CommitmentTier::Propose {
        let mutation_descriptor = require_capability(registry, "mail.send")?;
        bindings.push(TargetBinding {
            target_id: ids.id("target"),
            source_system: "mail".to_string(),
            app_or_service: mutation_descriptor.provider_id.clone(),
            object_reference: subject_reference,
            capability_id: mutation_descriptor.capability_id.clone(),
            resolution_confidence: 70,
            resolution_reason: "objective implies a proposed external communication mutation"
                .to_string(),
        });
    }

    Ok(bindings)
}

fn require_capability<'a>(
    registry: &'a [CapabilityDescriptor],
    capability_id: &str,
) -> Result<&'a CapabilityDescriptor, ControlPlaneError> {
    let descriptor = registry
        .iter()
        .find(|descriptor| descriptor.capability_id == capability_id)
        .ok_or_else(|| {
            ControlPlaneError::new(
                ControlPlaneErrorKind::CapabilityUnavailable,
                format!("capability {capability_id} is not declared"),
            )
        })?;

    if descriptor.availability != CapabilityAvailability::Available {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::CapabilityUnavailable,
            format!("capability {capability_id} is not available"),
        ));
    }

    Ok(descriptor)
}

fn build_plan(
    ids: &mut IdSequence,
    intent: &IntentFrame,
    target_bindings: &[TargetBinding],
    now_ms: u64,
) -> Result<DelegationPlan, ControlPlaneError> {
    let plan_id = ids.id("plan");
    let mut steps = Vec::new();

    for target_binding in target_bindings.iter().take(intent.scope.max_operations) {
        let is_read = target_binding.capability_id == "context.read";
        let state = if is_read {
            OperationState::Ready
        } else {
            OperationState::Planned
        };
        let idempotency_key = if is_read {
            Some(format!(
                "{}:{}:{}",
                intent.session_id,
                target_binding.capability_id,
                target_binding.object_reference.clone().unwrap_or_default()
            ))
        } else {
            None
        };
        let operation_id = ids.id("operation");
        let mut normalized_input = Metadata::new();
        normalized_input.insert("objective".to_string(), intent.objective.clone());
        normalized_input.insert(
            "contextSnapshotId".to_string(),
            intent.context_snapshot_id.clone(),
        );
        normalized_input.insert("sessionId".to_string(), intent.session_id.clone());
        if let Some(object_reference) = &target_binding.object_reference {
            normalized_input.insert("objectReference".to_string(), object_reference.clone());
        }

        steps.push(DelegatedOperation {
            operation_id: operation_id.clone(),
            plan_id: plan_id.clone(),
            target_binding: target_binding.clone(),
            capability_id: target_binding.capability_id.clone(),
            normalized_input,
            idempotency_key,
            timeout_ms: if is_read { 5_000 } else { 30_000 },
            retry_policy: RetryPolicy {
                max_attempts: if is_read { 2 } else { 1 },
                retry_idempotent_only: true,
            },
            state,
            correlation_id: format!("corr-{now_ms}-{operation_id}"),
        });
    }

    if steps.is_empty() {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::CapabilityUnavailable,
            "no declared targets could be planned",
        ));
    }

    Ok(DelegationPlan {
        plan_id,
        session_id: intent.session_id.clone(),
        intent_id: intent.intent_id.clone(),
        revision: 1,
        steps,
        dependencies: Vec::new(),
        approval_requirements: Vec::new(),
        expected_outputs: vec![
            "normalized artifact with source provenance".to_string(),
            "execution receipt only after approval and provider receipt".to_string(),
        ],
        cancellation_strategy: "best-effort cancellation; never duplicate non-idempotent mutations"
            .to_string(),
    })
}

fn apply_policy(
    ids: &mut IdSequence,
    plan: &mut DelegationPlan,
    registry: &[CapabilityDescriptor],
    intent: &IntentFrame,
    now_ms: u64,
) -> Result<Vec<ApprovalRequest>, ControlPlaneError> {
    let mut approval_requests = Vec::new();
    for operation in &mut plan.steps {
        let descriptor = require_capability(registry, &operation.capability_id)?;
        let requires_approval = descriptor.side_effect_class == SideEffectClass::ExternalConsequential
            || descriptor.side_effect_class == SideEffectClass::Destructive
            || descriptor.side_effect_class == SideEffectClass::Unknown;

        if requires_approval {
            operation.state = OperationState::AwaitingApproval;
            plan.approval_requirements.push(operation.operation_id.clone());
            let approval_id = ids.id("approval");
            let expected_effect = "External mail adapter would send the prepared content."
                .to_string();
            let data_disclosure = "Prepared summary and addressed message content would leave the app through the mail provider.".to_string();
            approval_requests.push(ApprovalRequest {
                approval_id: approval_id.clone(),
                session_id: plan.session_id.clone(),
                operation_id: operation.operation_id.clone(),
                plan_id: plan.plan_id.clone(),
                plan_revision: plan.revision,
                capability_id: operation.capability_id.clone(),
                commitment_tier: intent.commitment.clone(),
                actor: ApprovalActor::User,
                target: operation.target_binding.app_or_service.clone(),
                scope: operation
                    .target_binding
                    .object_reference
                    .clone()
                    .unwrap_or_else(|| "current bounded context".to_string()),
                expected_effect: expected_effect.clone(),
                data_disclosure: data_disclosure.clone(),
                reversibility: descriptor.reversibility.clone(),
                reason: "External consequential operation requires one-time approval.".to_string(),
                side_effect_class: Some(descriptor.side_effect_class.clone()),
                preview: redact_metadata_values(&operation.normalized_input),
                expires_at_ms: now_ms.saturating_add(APPROVAL_TTL_MS),
                binding: Some(ApprovalBinding {
                    approval_id,
                    operation_id: operation.operation_id.clone(),
                    plan_id: plan.plan_id.clone(),
                    plan_revision: plan.revision,
                    capability_id: operation.capability_id.clone(),
                    target_binding: operation_target_binding(operation),
                    normalized_input: redact_metadata_values(&operation.normalized_input),
                    side_effect_class: descriptor.side_effect_class.clone(),
                    expected_effect,
                    data_disclosure,
                    expires_at_ms: now_ms.saturating_add(APPROVAL_TTL_MS),
                    context_snapshot_revision: None,
                }),
            });
        }
    }

    Ok(approval_requests)
}

fn operation_target_binding(operation: &DelegatedOperation) -> Metadata {
    let mut target = Metadata::new();
    target.insert("targetId".to_string(), operation.target_binding.target_id.clone());
    target.insert(
        "sourceSystem".to_string(),
        operation.target_binding.source_system.clone(),
    );
    target.insert(
        "appOrService".to_string(),
        operation.target_binding.app_or_service.clone(),
    );
    target.insert("capabilityId".to_string(), operation.capability_id.clone());
    if let Some(object_reference) = &operation.target_binding.object_reference {
        target.insert("objectReference".to_string(), object_reference.clone());
    }
    target
}

fn dispatch_ready_reads(
    ids: &mut IdSequence,
    ledger: &mut DispatchLedger,
    activity_log: &mut ActivityLog,
    plan: &mut DelegationPlan,
    snapshot: &ContextSnapshot,
    artifacts: &mut Vec<NormalizedArtifact>,
    now_ms: u64,
    max_parallel_reads: usize,
) -> Result<(), ControlPlaneError> {
    let mut dispatched = 0usize;
    for operation in &mut plan.steps {
        if operation.capability_id != "context.read" || operation.state != OperationState::Ready {
            continue;
        }

        if dispatched >= max_parallel_reads {
            break;
        }

        ledger.dispatch(operation)?;
        dispatched = dispatched.saturating_add(1);
        record_lifecycle(activity_log, ids, now_ms, &plan.session_id, &plan.plan_id, operation);
        operation.state = OperationState::Succeeded;
        activity_log.record(
            ids,
            now_ms,
            &plan.session_id,
            &plan.plan_id,
            &operation.operation_id,
            Some(format!("provider-{}-succeeded", operation.operation_id)),
            OperationState::Succeeded,
            100,
            "Read capability completed and produced a normalized artifact.",
            None,
            None,
        );

        artifacts.push(normalize_read_artifact(ids, operation, snapshot, now_ms));
    }

    Ok(())
}

fn record_lifecycle(
    activity_log: &mut ActivityLog,
    ids: &mut IdSequence,
    now_ms: u64,
    session_id: &str,
    plan_id: &str,
    operation: &mut DelegatedOperation,
) {
    activity_log.record(
        ids,
        now_ms,
        session_id,
        plan_id,
        &operation.operation_id,
        Some(format!("provider-{}-dispatch", operation.operation_id)),
        OperationState::Dispatched,
        15,
        "Operation dispatched through declared capability.",
        None,
        None,
    );
    operation.state = OperationState::Acknowledged;
    activity_log.record(
        ids,
        now_ms,
        session_id,
        plan_id,
        &operation.operation_id,
        Some(format!("provider-{}-ack", operation.operation_id)),
        OperationState::Acknowledged,
        35,
        "Executor acknowledged operation.",
        None,
        None,
    );
    operation.state = OperationState::Running;
    activity_log.record(
        ids,
        now_ms,
        session_id,
        plan_id,
        &operation.operation_id,
        Some(format!("provider-{}-running", operation.operation_id)),
        OperationState::Running,
        60,
        "Executor is running bounded local work.",
        None,
        None,
    );
}

fn normalize_read_artifact(
    ids: &mut IdSequence,
    operation: &DelegatedOperation,
    snapshot: &ContextSnapshot,
    now_ms: u64,
) -> NormalizedArtifact {
    let source_reference = operation.target_binding.object_reference.clone();
    let source_summary = source_reference
        .as_ref()
        .and_then(|reference_id| {
            snapshot
                .focus_context
                .iter()
                .chain(snapshot.session_context.iter())
                .find(|reference| &reference.reference_id == reference_id)
        })
        .and_then(|reference| reference.uri_or_locator.clone())
        .unwrap_or_else(|| "No selected content was available.".to_string());

    NormalizedArtifact {
        artifact_id: ids.id("artifact"),
        artifact_type: "bounded_context_summary".to_string(),
        source_system: operation.target_binding.source_system.clone(),
        source_reference,
        content_or_summary: format!("Summary from bounded context: {source_summary}"),
        status: ArtifactStatus::DerivedInterpretation,
        version: "control-plane.normalized-artifact.v1".to_string(),
        generated_by_operation: operation.operation_id.clone(),
        intended_write_back: None,
        provenance: provenance(
            "deterministic-context-executor",
            now_ms,
            vec!["derived from focus context only".to_string()],
        ),
    }
}

fn approve_operation(
    operation: &mut DelegatedOperation,
    approval_request: &ApprovalRequest,
    current_plan_revision: u64,
) -> Result<(), ControlPlaneError> {
    if approval_request.plan_revision != current_plan_revision {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request does not match the current plan revision",
        ));
    }

    if approval_request.operation_id != operation.operation_id {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::PolicyBlocked,
            "approval request does not match the operation",
        ));
    }

    if operation.state != OperationState::AwaitingApproval {
        return Err(ControlPlaneError::new(
            ControlPlaneErrorKind::InvalidTransition,
            "operation is not waiting for approval",
        ));
    }

    operation.state = OperationState::Ready;
    Ok(())
}

fn execute_approved_mutation(
    ids: &mut IdSequence,
    ledger: &mut DispatchLedger,
    activity_log: &mut ActivityLog,
    operation: &mut DelegatedOperation,
    receipts: &mut Vec<ExecutionReceipt>,
    now_ms: u64,
) -> Result<(), ControlPlaneError> {
    ledger.dispatch(operation)?;
    let session_id = operation
        .normalized_input
        .get("sessionId")
        .cloned()
        .unwrap_or_else(|| "approved-session".to_string());
    let plan_id = operation.plan_id.clone();
    record_lifecycle(
        activity_log,
        ids,
        now_ms,
        &session_id,
        &plan_id,
        operation,
    );
    operation.state = OperationState::Succeeded;
    activity_log.record(
        ids,
        now_ms,
        &session_id,
        &operation.plan_id,
        &operation.operation_id,
        Some(format!("provider-{}-receipt", operation.operation_id)),
        OperationState::Succeeded,
        100,
        "Approved mutation completed with a deterministic fake receipt.",
        None,
        None,
    );
    receipts.push(ExecutionReceipt {
        operation_id: operation.operation_id.clone(),
        external_result_reference: Some(format!("fake-mail-receipt-{}", operation.operation_id)),
        effect_summary: "Fake mail adapter accepted the approved operation.".to_string(),
        committed_at_ms: now_ms,
        reversible_until_ms: None,
        native_undo_reference: None,
        provenance: provenance(
            "deterministic-fake-mail-adapter",
            now_ms,
            vec!["receipt generated only after explicit approval".to_string()],
        ),
    });
    Ok(())
}

fn reject_operation(
    ids: &mut IdSequence,
    activity_log: &mut ActivityLog,
    operation: &mut DelegatedOperation,
    now_ms: u64,
) {
    let session_id = operation
        .normalized_input
        .get("sessionId")
        .cloned()
        .unwrap_or_else(|| "policy-session".to_string());
    operation.state = OperationState::Cancelled;
    activity_log.record(
        ids,
        now_ms,
        &session_id,
        &operation.plan_id,
        &operation.operation_id,
        Some(format!("policy-{}-rejected", operation.operation_id)),
        OperationState::Cancelled,
        100,
        "User rejected the approval request; mutation was not dispatched.",
        Some("approval_rejected".to_string()),
        None,
    );
}

fn cancel_operation(
    ids: &mut IdSequence,
    activity_log: &mut ActivityLog,
    operation: &mut DelegatedOperation,
    now_ms: u64,
) {
    let session_id = operation
        .normalized_input
        .get("sessionId")
        .cloned()
        .unwrap_or_else(|| "policy-session".to_string());
    operation.state = OperationState::Cancelled;
    activity_log.record(
        ids,
        now_ms,
        &session_id,
        &operation.plan_id,
        &operation.operation_id,
        Some(format!("policy-{}-cancelled", operation.operation_id)),
        OperationState::Cancelled,
        100,
        "Operation cancelled before external dispatch.",
        Some("cancelled_before_dispatch".to_string()),
        None,
    );
}

fn reconcile_after_restart(snapshot: &RecoverySnapshot, now_ms: u64) -> RecoveryReport {
    let mut expired_approval_ids = Vec::new();
    let mut stale_context_reference_ids = Vec::new();
    let mut operations_requiring_verification = Vec::new();

    for approval in &snapshot.approval_requests {
        if approval.expires_at_ms <= now_ms {
            expired_approval_ids.push(approval.approval_id.clone());
        }
    }

    for reference in snapshot
        .context_snapshot
        .focus_context
        .iter()
        .chain(snapshot.context_snapshot.session_context.iter())
        .chain(snapshot.context_snapshot.related_context.iter())
    {
        if reference
            .freshness
            .expires_at_ms
            .is_some_and(|expires_at_ms| expires_at_ms <= now_ms)
        {
            stale_context_reference_ids.push(reference.reference_id.clone());
        }
    }

    for operation in &snapshot.plan.steps {
        if matches!(
            operation.state,
            OperationState::Dispatched | OperationState::Acknowledged | OperationState::Running
        ) && operation.idempotency_key.is_none()
        {
            operations_requiring_verification.push(operation.operation_id.clone());
        }
    }

    RecoveryReport {
        expired_approval_ids,
        stale_context_reference_ids,
        operations_requiring_verification,
    }
}

pub fn replay_activity_after(
    events: &[ActivityEvent],
    operation_id: &str,
    sequence: u64,
) -> Vec<ActivityEvent> {
    events
        .iter()
        .filter(|event| event.operation_id == operation_id && event.sequence > sequence)
        .cloned()
        .collect()
}

pub fn valid_transition(from: &OperationState, to: &OperationState, idempotent: bool) -> bool {
    match (from, to) {
        (OperationState::Planned, OperationState::Ready)
        | (OperationState::Planned, OperationState::AwaitingApproval)
        | (OperationState::AwaitingApproval, OperationState::Ready)
        | (OperationState::AwaitingApproval, OperationState::Cancelled)
        | (OperationState::Ready, OperationState::Dispatched)
        | (OperationState::Ready, OperationState::Cancelled)
        | (OperationState::Dispatched, OperationState::Acknowledged)
        | (OperationState::Dispatched, OperationState::Cancelled)
        | (OperationState::Acknowledged, OperationState::Running)
        | (OperationState::Running, OperationState::Paused)
        | (OperationState::Running, OperationState::Succeeded)
        | (OperationState::Running, OperationState::PartiallySucceeded)
        | (OperationState::Running, OperationState::Failed)
        | (OperationState::Running, OperationState::Cancelled)
        | (OperationState::Paused, OperationState::Running)
        | (OperationState::Paused, OperationState::Cancelled) => true,
        (OperationState::Failed, OperationState::Ready) => idempotent,
        _ => false,
    }
}

pub fn save_recovery_snapshot(
    path: &Path,
    snapshot: &RecoverySnapshot,
) -> Result<(), ControlPlaneError> {
    let contents = serde_json::to_string_pretty(snapshot).map_err(|error| ControlPlaneError {
        kind: ControlPlaneErrorKind::Io,
        message: "could not serialize recovery snapshot".to_string(),
        raw_diagnostic: Some(error.to_string()),
        retryable: false,
    })?;
    fs::write(path, contents).map_err(|error| ControlPlaneError {
        kind: ControlPlaneErrorKind::Io,
        message: format!("could not write recovery snapshot to {}", path.display()),
        raw_diagnostic: Some(error.to_string()),
        retryable: true,
    })
}

pub fn load_recovery_snapshot(path: &Path) -> Result<RecoverySnapshot, ControlPlaneError> {
    let contents = fs::read_to_string(path).map_err(|error| ControlPlaneError {
        kind: ControlPlaneErrorKind::Io,
        message: format!("could not read recovery snapshot from {}", path.display()),
        raw_diagnostic: Some(error.to_string()),
        retryable: true,
    })?;
    serde_json::from_str(&contents).map_err(|error| ControlPlaneError {
        kind: ControlPlaneErrorKind::Io,
        message: "could not parse recovery snapshot".to_string(),
        raw_diagnostic: Some(error.to_string()),
        retryable: false,
    })
}

fn provenance(source: &str, recorded_at_ms: u64, evidence: Vec<impl Into<String>>) -> Provenance {
    Provenance {
        source: source.to_string(),
        evidence: evidence.into_iter().map(Into::into).collect(),
        recorded_at_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn mutation_input() -> ControlPlaneDemoInput {
        ControlPlaneDemoInput {
            objective: Some("Summarize this and send it there after approval".to_string()),
            active_app: Some("Mail".to_string()),
            active_window: Some("Important thread".to_string()),
            selected_text: Some("Customer asks for a concise launch update.".to_string()),
            approval_decision: None,
            now_ms: Some(10_000),
        }
    }

    #[test]
    fn context_snapshot_marks_stale_references_on_recovery() {
        let result = run_control_plane_demo(mutation_input()).expect("demo should run");
        let report = reconcile_after_restart(&result.recovery_snapshot, 41_000);
        assert!(!report.stale_context_reference_ids.is_empty());
    }

    #[test]
    fn reference_resolution_uses_selected_focus_context_for_this() {
        let mut ids = IdSequence::default();
        let input = mutation_input();
        let observation = build_observation(&mut ids, &input, 10_000);
        let snapshot = build_context_snapshot(&mut ids, &observation, 10_000);
        let resolved = resolve_reference("please summarize this", &snapshot)
            .expect("selected context should resolve");
        assert_eq!(resolved.object_type, ObjectType::SelectedText);
    }

    #[test]
    fn intent_updates_preserve_session_and_alternatives() {
        let mut ids = IdSequence::default();
        let input = mutation_input();
        let observation = build_observation(&mut ids, &input, 10_000);
        let snapshot = build_context_snapshot(&mut ids, &observation, 10_000);
        let first = resolve_intent(&mut ids, "summarize this", &snapshot, None, 10_000);
        let updated = resolve_intent(
            &mut ids,
            "no, prepare the shorter version",
            &snapshot,
            Some(&first),
            10_001,
        );
        assert_eq!(first.session_id, updated.session_id);
        assert_eq!(first.intent_id, updated.intent_id);
    }

    #[test]
    fn capability_resolution_fails_closed_for_missing_capability() {
        let err = require_capability(&[], "mail.send").expect_err("missing capability should fail");
        assert_eq!(err.kind, ControlPlaneErrorKind::CapabilityUnavailable);
    }

    #[test]
    fn invalid_delegation_state_transition_is_rejected() {
        assert!(!valid_transition(
            &OperationState::AwaitingApproval,
            &OperationState::Dispatched,
            false
        ));
        assert!(valid_transition(
            &OperationState::Failed,
            &OperationState::Ready,
            true
        ));
        assert!(!valid_transition(
            &OperationState::Failed,
            &OperationState::Ready,
            false
        ));
    }

    #[test]
    fn duplicate_dispatch_is_prevented() {
        let mut result = run_control_plane_demo(ControlPlaneDemoInput {
            approval_decision: Some(ApprovalDecision::Approve),
            ..mutation_input()
        })
        .expect("demo should run");
        let mut ledger = DispatchLedger::new();
        let read_operation = result
            .plan
            .steps
            .iter_mut()
            .find(|step| step.capability_id == "context.read")
            .expect("read operation should exist");
        read_operation.state = OperationState::Ready;
        ledger.dispatch(read_operation).expect("first dispatch should pass");
        read_operation.state = OperationState::Ready;
        let err = ledger
            .dispatch(read_operation)
            .expect_err("second dispatch should be blocked");
        assert_eq!(err.kind, ControlPlaneErrorKind::DuplicateDispatch);
    }

    #[test]
    fn read_dispatch_obeys_bounded_execution_limit() {
        let mut ids = IdSequence::default();
        let mut plan = DelegationPlan {
            plan_id: "plan".to_string(),
            session_id: "session".to_string(),
            intent_id: "intent".to_string(),
            revision: 1,
            steps: Vec::new(),
            dependencies: Vec::new(),
            approval_requirements: Vec::new(),
            expected_outputs: Vec::new(),
            cancellation_strategy: "test".to_string(),
        };
        for index in 0..3 {
            plan.steps.push(DelegatedOperation {
                operation_id: format!("op-{index}"),
                plan_id: "plan".to_string(),
                target_binding: TargetBinding {
                    target_id: format!("target-{index}"),
                    source_system: "control-plane".to_string(),
                    app_or_service: "deterministic-context-executor".to_string(),
                    object_reference: None,
                    capability_id: "context.read".to_string(),
                    resolution_confidence: 90,
                    resolution_reason: "test".to_string(),
                },
                capability_id: "context.read".to_string(),
                normalized_input: Metadata::new(),
                idempotency_key: Some(format!("read-{index}")),
                timeout_ms: 100,
                retry_policy: RetryPolicy {
                    max_attempts: 1,
                    retry_idempotent_only: true,
                },
                state: OperationState::Ready,
                correlation_id: format!("corr-{index}"),
            });
        }
        let mut ledger = DispatchLedger::new();
        let mut activity_log = ActivityLog::new();
        let snapshot = ContextSnapshot {
            snapshot_id: "snapshot".to_string(),
            revision: 1,
            focus_context: Vec::new(),
            session_context: Vec::new(),
            related_context: Vec::new(),
            unresolved_references: Vec::new(),
            created_at_ms: 1,
        };
        let mut artifacts = Vec::new();
        dispatch_ready_reads(
            &mut ids,
            &mut ledger,
            &mut activity_log,
            &mut plan,
            &snapshot,
            &mut artifacts,
            1,
            2,
        )
        .expect("bounded read dispatch should pass");
        assert_eq!(
            plan.steps
                .iter()
                .filter(|step| step.state == OperationState::Succeeded)
                .count(),
            2
        );
    }

    #[test]
    fn cancellation_before_dispatch_records_non_execution() {
        let result = run_control_plane_demo(ControlPlaneDemoInput {
            approval_decision: Some(ApprovalDecision::Cancel),
            ..mutation_input()
        })
        .expect("demo should run");
        assert!(result.verified_non_execution);
        assert!(result.receipts.is_empty());
        assert!(result
            .plan
            .steps
            .iter()
            .any(|step| step.state == OperationState::Cancelled));
    }

    #[test]
    fn mutations_require_approval() {
        let result = run_control_plane_demo(mutation_input()).expect("demo should run");
        assert_eq!(result.approval_requests.len(), 1);
        assert!(result
            .plan
            .steps
            .iter()
            .any(|step| step.state == OperationState::AwaitingApproval));
        assert!(result.receipts.is_empty());
    }

    #[test]
    fn approval_is_bound_to_exact_plan_revision() {
        let mut result = run_control_plane_demo(mutation_input()).expect("demo should run");
        let approval = result
            .approval_requests
            .first()
            .expect("approval should exist")
            .clone();
        let operation = result
            .plan
            .steps
            .iter_mut()
            .find(|step| step.operation_id == approval.operation_id)
            .expect("operation should exist");
        let err = approve_operation(operation, &approval, 2)
            .expect_err("wrong plan revision should fail");
        assert_eq!(err.kind, ControlPlaneErrorKind::PolicyBlocked);
    }

    #[test]
    fn partial_result_and_error_events_are_normalized() {
        let mut ids = IdSequence::default();
        let mut log = ActivityLog::new();
        let error = ControlPlaneError {
            kind: ControlPlaneErrorKind::ExecutorFailed,
            message: "provider returned a safe diagnostic".to_string(),
            raw_diagnostic: Some("redacted-provider-code-42".to_string()),
            retryable: true,
        };
        log.record(
            &mut ids,
            1,
            "session",
            "plan",
            "operation",
            Some("provider-event".to_string()),
            OperationState::Failed,
            50,
            "provider failed",
            Some("retry_or_cancel".to_string()),
            Some(error),
        );
        assert_eq!(log.events[0].sequence, 1);
        assert!(log.events[0].error.is_some());
    }

    #[test]
    fn event_replay_deduplicates_provider_events() {
        let mut ids = IdSequence::default();
        let mut log = ActivityLog::new();
        for _ in 0..2 {
            log.record(
                &mut ids,
                1,
                "session",
                "plan",
                "operation",
                Some("same-provider-event".to_string()),
                OperationState::Running,
                25,
                "duplicate",
                None,
                None,
            );
        }
        assert_eq!(log.events.len(), 1);
        assert_eq!(replay_activity_after(&log.events, "operation", 0).len(), 1);
    }

    #[test]
    fn restart_recovery_blocks_duplicate_non_idempotent_mutation() {
        let mut result = run_control_plane_demo(ControlPlaneDemoInput {
            approval_decision: Some(ApprovalDecision::Approve),
            ..mutation_input()
        })
        .expect("demo should run");
        let mutation = result
            .recovery_snapshot
            .plan
            .steps
            .iter_mut()
            .find(|step| step.capability_id == "mail.send")
            .expect("mutation should exist");
        mutation.state = OperationState::Running;
        mutation.idempotency_key = None;
        let report = reconcile_after_restart(&result.recovery_snapshot, 11_000);
        assert_eq!(report.operations_requiring_verification.len(), 1);
    }

    #[test]
    fn provenance_links_source_to_receipt_after_approval() {
        let result = run_control_plane_demo(ControlPlaneDemoInput {
            approval_decision: Some(ApprovalDecision::Approve),
            ..mutation_input()
        })
        .expect("demo should run");
        assert_eq!(result.receipts.len(), 1);
        assert_eq!(
            result.receipts[0].provenance.source,
            "deterministic-fake-mail-adapter"
        );
        assert!(!result.artifacts.is_empty());
    }

    #[test]
    fn atlas_absence_keeps_runtime_hot_path_empty() {
        let result = run_control_plane_demo(mutation_input()).expect("demo should run");
        assert!(result
            .intent
            .constraints
            .iter()
            .any(|constraint| constraint == "no direct model-to-OS execution"));
        assert!(result
            .capability_registry
            .iter()
            .all(|descriptor| !descriptor.input_schema.contains("atlas.raw")));
    }

    #[test]
    fn recovery_snapshot_round_trips_as_json() {
        let result = run_control_plane_demo(mutation_input()).expect("demo should run");
        let path = env::temp_dir().join("adaptive-surface-control-plane-recovery-test.json");
        save_recovery_snapshot(&path, &result.recovery_snapshot).expect("snapshot should save");
        let loaded = load_recovery_snapshot(&path).expect("snapshot should load");
        let _ = fs::remove_file(&path);
        assert_eq!(loaded.snapshot_id, result.recovery_snapshot.snapshot_id);
    }

    #[test]
    fn deterministic_end_to_end_slice_reaches_approval_gate() {
        let result = run_control_plane_demo(mutation_input()).expect("demo should run");
        assert_eq!(result.context_snapshot.revision, 1);
        assert_eq!(result.intent.workflow_family, WorkflowFamily::Communication);
        assert_eq!(result.target_bindings.len(), 2);
        assert_eq!(result.artifacts.len(), 1);
        assert_eq!(result.approval_requests.len(), 1);
        assert!(result.receipts.is_empty());
    }
}
