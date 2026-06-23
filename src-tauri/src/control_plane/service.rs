use super::contracts::*;
use super::repository::{
    ControlPlaneRepository, InMemoryControlPlaneRepository, SqliteControlPlaneRepository,
};
use crate::apple::mail;
use crate::apple::models::{AppleMailMessage, MailQuery};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

macro_rules! metadata {
    ($($key:expr => $value:expr),* $(,)?) => {{
        let mut values = Metadata::new();
        $(
            values.insert($key.to_string(), $value.to_string());
        )*
        values
    }};
}

pub trait MailMetadataProvider: Send {
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

pub struct ControlPlaneService {
    repository: Box<dyn ControlPlaneRepository>,
    mail_provider: Box<dyn MailMetadataProvider>,
    sessions: BTreeMap<SessionId, ControlPlaneSessionSnapshot>,
    active_session_id: Option<SessionId>,
    next_id: u64,
    next_sequence: u64,
    seen_client_requests: BTreeSet<String>,
}

impl ControlPlaneService {
    pub fn new_app() -> Result<Self, ControlPlaneError> {
        let repository = SqliteControlPlaneRepository::open(default_sqlite_path())?;
        Self::new(Box::new(repository), Box::new(AppleMailMetadataProvider))
    }

    pub fn in_memory() -> Self {
        Self::new(
            Box::new(InMemoryControlPlaneRepository::new()),
            Box::new(AppleMailMetadataProvider),
        )
        .expect("in-memory control-plane repository should initialize")
    }

    pub fn new(
        mut repository: Box<dyn ControlPlaneRepository>,
        mail_provider: Box<dyn MailMetadataProvider>,
    ) -> Result<Self, ControlPlaneError> {
        let events = repository.load_events()?;
        let snapshots = repository.load_snapshots()?;
        let next_sequence = events
            .iter()
            .map(|event| event.sequence)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
        let mut sessions = BTreeMap::new();
        for snapshot in snapshots {
            sessions.insert(snapshot.session_id.clone(), snapshot);
        }
        let active_session_id = sessions.keys().next_back().cloned();

        Ok(Self {
            repository,
            mail_provider,
            sessions,
            active_session_id,
            next_id: next_sequence.saturating_mul(10),
            next_sequence,
            seen_client_requests: BTreeSet::new(),
        })
    }

    #[cfg(test)]
    pub fn with_fixture_mail(messages: Vec<AppleMailMessage>) -> Self {
        Self::new(
            Box::new(InMemoryControlPlaneRepository::new()),
            Box::new(FixtureMailMetadataProvider { messages }),
        )
        .expect("fixture service should initialize")
    }

    pub fn canonical_capabilities() -> Vec<SemanticCapabilityDescriptor> {
        vec![
            SemanticCapabilityDescriptor {
                capability_id: "mail.search".to_string(),
                provider_binding: "apple-mail-envelope-index".to_string(),
                input_contract: "control-plane.mail-search.input.v1".to_string(),
                output_contract: "control-plane.mail-metadata-list.v1".to_string(),
                availability: CapabilityAvailability::Available,
                risk_class: SemanticRiskClass::SafeRead,
                approval_requirement: ApprovalRequirement::None,
                timeout_ms: 5_000,
                supports_cancellation: true,
                idempotency_semantics: "metadata read only; safe to retry".to_string(),
                side_effect_class: SideEffectClass::None,
            },
            SemanticCapabilityDescriptor {
                capability_id: "triage.classify".to_string(),
                provider_binding: "deterministic-local-triage".to_string(),
                input_contract: "control-plane.mail-metadata-list.v1".to_string(),
                output_contract: "control-plane.triage-summary.v1".to_string(),
                availability: CapabilityAvailability::Available,
                risk_class: SemanticRiskClass::SafeRead,
                approval_requirement: ApprovalRequirement::None,
                timeout_ms: 2_000,
                supports_cancellation: true,
                idempotency_semantics: "pure deterministic classification".to_string(),
                side_effect_class: SideEffectClass::None,
            },
            SemanticCapabilityDescriptor {
                capability_id: "artifact.create".to_string(),
                provider_binding: "in-app-surface-artifact".to_string(),
                input_contract: "control-plane.triage-summary.v1".to_string(),
                output_contract: "control-plane.artifact-envelope.v1".to_string(),
                availability: CapabilityAvailability::Available,
                risk_class: SemanticRiskClass::LocalWrite,
                approval_requirement: ApprovalRequirement::None,
                timeout_ms: 2_000,
                supports_cancellation: true,
                idempotency_semantics: "local in-app artifact projection; no disk write".to_string(),
                side_effect_class: SideEffectClass::LocalReversible,
            },
        ]
    }

    pub fn submit_final_utterance(
        &mut self,
        input: SubmitObjectiveInput,
    ) -> Result<SubmitObjectiveResponse, ControlPlaneError> {
        let utterance = input.utterance.trim().to_string();
        if utterance.is_empty() {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "final utterance cannot be empty",
            ));
        }

        if let Some(client_request_id) = &input.client_request_id {
            if !self.seen_client_requests.insert(client_request_id.clone()) {
                let snapshot = self.active_snapshot(input.session_id.clone());
                return Ok(SubmitObjectiveResponse {
                    route: SubmitObjectiveRoute::Handled,
                    session_id: snapshot.session_id.clone(),
                    objective_id: snapshot
                        .objective_id
                        .clone()
                        .unwrap_or_else(|| ObjectiveId::new("objective-duplicate")),
                    graph_id: snapshot.active_graph_id.clone(),
                    plan_revision: snapshot.plan_revision,
                    events: Vec::new(),
                    pending_approvals: snapshot.pending_approvals.clone(),
                    snapshot,
                });
            }
        }

        let now_ms = input.now_ms.unwrap_or_else(epoch_ms);
        let session_id = input
            .session_id
            .clone()
            .or_else(|| self.active_session_id.clone())
            .unwrap_or_else(|| self.id("session", now_ms, SessionId::new));
        let objective_id = self
            .sessions
            .get(&session_id)
            .and_then(|snapshot| snapshot.objective_id.clone())
            .unwrap_or_else(|| self.id("objective", now_ms, ObjectiveId::new));
        let run_id = self.id("run", now_ms, RunId::new);
        let plan_revision = self
            .sessions
            .get(&session_id)
            .map(|snapshot| snapshot.plan_revision.saturating_add(1))
            .unwrap_or(1);
        let mut events = Vec::new();

        if !is_inbox_triage_utterance(&utterance) {
            let fallback_event = self.record_event(
                &session_id,
                &objective_id,
                plan_revision,
                None,
                None,
                &run_id,
                now_ms,
                RuntimeEventPayload::LegacyFallbackRequested {
                    reason: "No migrated Rust task graph exists for this utterance yet.".to_string(),
                },
            )?;
            events.push(fallback_event);
            let completed = self.record_event(
                &session_id,
                &objective_id,
                plan_revision,
                None,
                None,
                &run_id,
                now_ms,
                RuntimeEventPayload::ExecutionCompleted {
                    status: RuntimeTerminalStatus::LegacyFallback,
                    summary: "Delegated to the legacy frontend route without storing the raw utterance.".to_string(),
                },
            )?;
            events.push(completed);
            let snapshot = self.save_snapshot(
                session_id,
                Some(objective_id),
                None,
                plan_revision,
                Vec::new(),
                Vec::new(),
                &events,
            )?;
            return Ok(SubmitObjectiveResponse {
                route: SubmitObjectiveRoute::LegacyFallback,
                session_id: snapshot.session_id.clone(),
                objective_id: snapshot
                    .objective_id
                    .clone()
                    .expect("snapshot should include objective"),
                graph_id: None,
                plan_revision,
                pending_approvals: snapshot.pending_approvals.clone(),
                events,
                snapshot,
            });
        }

        let objective_event = self.record_event(
            &session_id,
            &objective_id,
            plan_revision,
            None,
            None,
            &run_id,
            now_ms,
            RuntimeEventPayload::ObjectiveAccepted {
                utterance: utterance.clone(),
                objective: objective_from_utterance(&utterance),
                routed_by: input
                    .model_intent_hint
                    .clone()
                    .unwrap_or_else(|| "deterministic-control-plane".to_string()),
            },
        )?;
        events.push(objective_event);

        let graph_id = self.id("graph", now_ms, TaskGraphId::new);
        let mode = infer_email_triage_mode(&utterance);
        let mut graph = build_inbox_triage_graph(
            graph_id.clone(),
            session_id.clone(),
            objective_id.clone(),
            plan_revision,
            now_ms,
            &utterance,
            mode,
            self,
        );

        let plan_event = self.record_event(
            &session_id,
            &objective_id,
            plan_revision,
            Some(graph_id.clone()),
            None,
            &run_id,
            now_ms,
            RuntimeEventPayload::PlanCreated {
                graph: graph.clone(),
                summary: "Created read-only inbox triage task graph.".to_string(),
            },
        )?;
        events.push(plan_event);

        let mail_unit_id = graph.work_units[0].work_unit_id.clone();
        events.extend(self.run_lifecycle(
            &mut graph,
            &mail_unit_id,
            &session_id,
            &objective_id,
            plan_revision,
            &graph_id,
            &run_id,
            now_ms,
            "Loading Apple Mail metadata through declared mail.search capability.",
        )?);

        let mail_result = self.mail_provider.search(25, true);
        let messages = match mail_result {
            Ok(messages) => {
                graph.work_units[0].state = OperationState::Succeeded;
                let done = self.record_event(
                    &session_id,
                    &objective_id,
                    plan_revision,
                    Some(graph_id.clone()),
                    Some(mail_unit_id.clone()),
                    &run_id,
                    now_ms,
                    RuntimeEventPayload::WorkUnitLifecycle {
                        work_unit_id: mail_unit_id,
                        state: OperationState::Succeeded,
                        progress: 100,
                        message: format!("Loaded {} Apple Mail metadata rows. Full bodies were not read.", messages.len()),
                    },
                )?;
                events.push(done);
                messages
            }
            Err(error) => {
                graph.work_units[0].state = OperationState::Failed;
                let failed = self.record_event(
                    &session_id,
                    &objective_id,
                    plan_revision,
                    Some(graph_id.clone()),
                    Some(mail_unit_id.clone()),
                    &run_id,
                    now_ms,
                    RuntimeEventPayload::WorkUnitLifecycle {
                        work_unit_id: mail_unit_id,
                        state: OperationState::Failed,
                        progress: 100,
                        message: error.message.clone(),
                    },
                )?;
                events.push(failed);
                let completed = self.record_event(
                    &session_id,
                    &objective_id,
                    plan_revision,
                    Some(graph_id.clone()),
                    None,
                    &run_id,
                    now_ms,
                    RuntimeEventPayload::ExecutionCompleted {
                        status: RuntimeTerminalStatus::Failed,
                        summary: "Inbox triage stopped because Mail metadata was unavailable.".to_string(),
                    },
                )?;
                events.push(completed);
                let snapshot = self.save_snapshot(
                    session_id,
                    Some(objective_id),
                    Some(graph),
                    plan_revision,
                    Vec::new(),
                    Vec::new(),
                    &events,
                )?;
                return Ok(SubmitObjectiveResponse {
                    route: SubmitObjectiveRoute::Handled,
                    session_id: snapshot.session_id.clone(),
                    objective_id: snapshot.objective_id.clone().expect("objective should exist"),
                    graph_id: snapshot.active_graph_id.clone(),
                    plan_revision,
                    pending_approvals: snapshot.pending_approvals.clone(),
                    events,
                    snapshot,
                });
            }
        };

        let classify_unit_id = graph.work_units[1].work_unit_id.clone();
        events.extend(self.run_lifecycle(
            &mut graph,
            &classify_unit_id,
            &session_id,
            &objective_id,
            plan_revision,
            &graph_id,
            &run_id,
            now_ms,
            "Classifying metadata-only inbox triage signals.",
        )?);
        graph.work_units[1].state = OperationState::Succeeded;
        let classify_done = self.record_event(
            &session_id,
            &objective_id,
            plan_revision,
            Some(graph_id.clone()),
            Some(classify_unit_id.clone()),
            &run_id,
            now_ms,
            RuntimeEventPayload::WorkUnitLifecycle {
                work_unit_id: classify_unit_id,
                state: OperationState::Succeeded,
                progress: 100,
                message: "Metadata triage classification completed.".to_string(),
            },
        )?;
        events.push(classify_done);

        let artifact_unit_id = graph.work_units[2].work_unit_id.clone();
        events.extend(self.run_lifecycle(
            &mut graph,
            &artifact_unit_id,
            &session_id,
            &objective_id,
            plan_revision,
            &graph_id,
            &run_id,
            now_ms,
            "Creating in-app artifact envelope without writing to disk.",
        )?);
        let artifact = build_inbox_triage_artifact(
            self.id("artifact", now_ms, ArtifactId::new),
            &utterance,
            mode,
            &messages,
            now_ms,
        );
        graph.work_units[2].state = OperationState::Succeeded;
        let artifact_event = self.record_event(
            &session_id,
            &objective_id,
            plan_revision,
            Some(graph_id.clone()),
            Some(artifact_unit_id.clone()),
            &run_id,
            now_ms,
            RuntimeEventPayload::ArtifactAdded {
                artifact: artifact.clone(),
            },
        )?;
        events.push(artifact_event);
        let artifact_done = self.record_event(
            &session_id,
            &objective_id,
            plan_revision,
            Some(graph_id.clone()),
            Some(artifact_unit_id),
            &run_id,
            now_ms,
            RuntimeEventPayload::WorkUnitLifecycle {
                work_unit_id: graph.work_units[2].work_unit_id.clone(),
                state: OperationState::Succeeded,
                progress: 100,
                message: "In-app triage artifact created.".to_string(),
            },
        )?;
        events.push(artifact_done);
        let completed = self.record_event(
            &session_id,
            &objective_id,
            plan_revision,
            Some(graph_id.clone()),
            None,
            &run_id,
            now_ms,
            RuntimeEventPayload::ExecutionCompleted {
                status: RuntimeTerminalStatus::Succeeded,
                summary: "Inbox triage completed through the Rust control plane.".to_string(),
            },
        )?;
        events.push(completed);

        let snapshot = self.save_snapshot(
            session_id,
            Some(objective_id),
            Some(graph),
            plan_revision,
            vec![artifact],
            Vec::new(),
            &events,
        )?;

        Ok(SubmitObjectiveResponse {
            route: SubmitObjectiveRoute::Handled,
            session_id: snapshot.session_id.clone(),
            objective_id: snapshot.objective_id.clone().expect("objective should exist"),
            graph_id: snapshot.active_graph_id.clone(),
            plan_revision,
            pending_approvals: snapshot.pending_approvals.clone(),
            events,
            snapshot,
        })
    }

    pub fn cancel_operation(
        &mut self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        self.update_operation_terminal(command, OperationState::Cancelled, "Operation cancelled by request.")
    }

    pub fn approve_operation(
        &mut self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let approval_id = command.approval_id.clone().ok_or_else(|| {
            ControlPlaneError::new(ControlPlaneErrorKind::PolicyBlocked, "approval id is required")
        })?;
        let mut snapshot = self.get_session_snapshot(command.session_id.clone())?;
        let approval = snapshot
            .pending_approvals
            .iter()
            .find(|approval| approval.approval_id == approval_id.as_str())
            .cloned()
            .ok_or_else(|| {
                ControlPlaneError::new(ControlPlaneErrorKind::PolicyBlocked, "approval request was not found")
            })?;
        if approval.plan_revision != command.plan_revision {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::PolicyBlocked,
                "approval request does not match the current plan revision",
            ));
        }
        snapshot.pending_approvals.retain(|approval| approval.approval_id != approval_id.as_str());
        self.repository.save_events_and_snapshot(&[], &snapshot)?;
        self.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
        Ok(snapshot)
    }

    pub fn reject_operation(
        &mut self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        self.update_operation_terminal(command, OperationState::Cancelled, "Operation rejected by request.")
    }

    pub fn get_session_snapshot(
        &mut self,
        session_id: SessionId,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        self.sessions.get(&session_id).cloned().ok_or_else(|| {
            ControlPlaneError::new(
                ControlPlaneErrorKind::RecoveryRequiresVerification,
                format!("session {} was not found", session_id),
            )
        })
    }

    pub fn list_pending_approvals(&self) -> Vec<ApprovalRequest> {
        self.sessions
            .values()
            .flat_map(|snapshot| snapshot.pending_approvals.clone())
            .collect()
    }

    fn active_snapshot(&self, requested_session_id: Option<SessionId>) -> ControlPlaneSessionSnapshot {
        let session_id = requested_session_id
            .or_else(|| self.active_session_id.clone())
            .unwrap_or_else(|| SessionId::new("session-uninitialized"));
        self.sessions
            .get(&session_id)
            .cloned()
            .unwrap_or_else(|| empty_snapshot(session_id, self.next_sequence))
    }

    fn update_operation_terminal(
        &mut self,
        command: OperationCommand,
        terminal_state: OperationState,
        message: &str,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let now_ms = command.now_ms.unwrap_or_else(epoch_ms);
        let mut snapshot = self.get_session_snapshot(command.session_id.clone())?;
        if snapshot.plan_revision != command.plan_revision {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "operation command plan revision is stale",
            ));
        }
        let Some(graph_id) = snapshot.active_graph_id.clone() else {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "no active graph is available",
            ));
        };
        let objective_id = snapshot
            .objective_id
            .clone()
            .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "no active objective is available"))?;
        let run_id = self.id("run", now_ms, RunId::new);
        let event = self.record_event(
            &snapshot.session_id,
            &objective_id,
            snapshot.plan_revision,
            Some(graph_id),
            Some(command.work_unit_id.clone()),
            &run_id,
            now_ms,
            RuntimeEventPayload::WorkUnitLifecycle {
                work_unit_id: command.work_unit_id,
                state: terminal_state,
                progress: 100,
                message: message.to_string(),
            },
        )?;
        snapshot.recent_events.push(event);
        snapshot.next_sequence = self.next_sequence;
        let events = snapshot.recent_events.last().cloned().into_iter().collect::<Vec<_>>();
        self.repository.save_events_and_snapshot(&events, &snapshot)?;
        self.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
        Ok(snapshot)
    }

    #[allow(clippy::too_many_arguments)]
    fn run_lifecycle(
        &mut self,
        graph: &mut TaskGraph,
        work_unit_id: &WorkUnitId,
        session_id: &SessionId,
        objective_id: &ObjectiveId,
        plan_revision: u64,
        graph_id: &TaskGraphId,
        run_id: &RunId,
        now_ms: u64,
        running_message: &str,
    ) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        let mut events = Vec::new();
        if let Some(unit) = graph
            .work_units
            .iter_mut()
            .find(|unit| &unit.work_unit_id == work_unit_id)
        {
            unit.state = OperationState::Ready;
        }
        events.push(self.record_event(
            session_id,
            objective_id,
            plan_revision,
            Some(graph_id.clone()),
            Some(work_unit_id.clone()),
            run_id,
            now_ms,
            RuntimeEventPayload::WorkUnitLifecycle {
                work_unit_id: work_unit_id.clone(),
                state: OperationState::Ready,
                progress: 0,
                message: "Work unit queued by task graph.".to_string(),
            },
        )?);
        if let Some(unit) = graph
            .work_units
            .iter_mut()
            .find(|unit| &unit.work_unit_id == work_unit_id)
        {
            unit.state = OperationState::Running;
        }
        events.push(self.record_event(
            session_id,
            objective_id,
            plan_revision,
            Some(graph_id.clone()),
            Some(work_unit_id.clone()),
            run_id,
            now_ms,
            RuntimeEventPayload::WorkUnitLifecycle {
                work_unit_id: work_unit_id.clone(),
                state: OperationState::Running,
                progress: 50,
                message: running_message.to_string(),
            },
        )?);
        Ok(events)
    }

    #[allow(clippy::too_many_arguments)]
    fn record_event(
        &mut self,
        session_id: &SessionId,
        objective_id: &ObjectiveId,
        plan_revision: u64,
        graph_id: Option<TaskGraphId>,
        work_unit_id: Option<WorkUnitId>,
        run_id: &RunId,
        now_ms: u64,
        payload: RuntimeEventPayload,
    ) -> Result<RuntimeEventEnvelope, ControlPlaneError> {
        let event = RuntimeEventEnvelope {
            protocol_version: CONTROL_PLANE_PROTOCOL_VERSION.to_string(),
            event_id: self.id("event", now_ms, RuntimeEventId::new),
            sequence: self.next_sequence,
            session_id: session_id.clone(),
            objective_id: objective_id.clone(),
            plan_revision,
            graph_id,
            work_unit_id,
            run_id: run_id.clone(),
            occurred_at_ms: now_ms,
            payload,
        };
        self.next_sequence = self.next_sequence.saturating_add(1);
        Ok(event)
    }

    fn save_snapshot(
        &mut self,
        session_id: SessionId,
        objective_id: Option<ObjectiveId>,
        graph: Option<TaskGraph>,
        plan_revision: u64,
        new_artifacts: Vec<ArtifactEnvelope>,
        pending_approvals: Vec<ApprovalRequest>,
        events: &[RuntimeEventEnvelope],
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let mut snapshot = self
            .sessions
            .remove(&session_id)
            .unwrap_or_else(|| empty_snapshot(session_id.clone(), self.next_sequence));
        snapshot.objective_id = objective_id;
        snapshot.plan_revision = plan_revision;
        if let Some(graph) = graph {
            snapshot.active_graph_id = Some(graph.graph_id.clone());
            snapshot.task_graphs.retain(|existing| existing.graph_id != graph.graph_id);
            snapshot.task_graphs.push(graph);
        }
        snapshot.artifacts.extend(new_artifacts);
        snapshot.pending_approvals = pending_approvals;
        snapshot.recent_events.extend(events.iter().cloned());
        if snapshot.recent_events.len() > 80 {
            let keep_from = snapshot.recent_events.len().saturating_sub(80);
            snapshot.recent_events = snapshot.recent_events.split_off(keep_from);
        }
        snapshot.next_sequence = self.next_sequence;
        self.repository.save_events_and_snapshot(events, &snapshot)?;
        self.active_session_id = Some(snapshot.session_id.clone());
        self.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
        Ok(snapshot)
    }

    fn id<T>(&mut self, prefix: &str, now_ms: u64, constructor: impl FnOnce(String) -> T) -> T {
        self.next_id = self.next_id.saturating_add(1);
        constructor(format!("{prefix}-{now_ms}-{}", self.next_id))
    }
}

fn build_inbox_triage_graph(
    graph_id: TaskGraphId,
    session_id: SessionId,
    objective_id: ObjectiveId,
    plan_revision: u64,
    now_ms: u64,
    utterance: &str,
    mode: EmailTriageMode,
    service: &mut ControlPlaneService,
) -> TaskGraph {
    let mail_unit_id = service.id("work-mail-search", now_ms, WorkUnitId::new);
    let classify_unit_id = service.id("work-triage-classify", now_ms, WorkUnitId::new);
    let artifact_unit_id = service.id("work-artifact-create", now_ms, WorkUnitId::new);
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
                input: metadata! { "mode" => mode.as_str() },
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
                    "writesToDisk" => "false",
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
            max_attempts: 2,
            retry_idempotent_only: true,
        },
        idempotency_key: Some(idempotency_key),
        supports_cancellation: true,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EmailTriageMode {
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
    fn as_str(self) -> &'static str {
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
}

fn build_inbox_triage_artifact(
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

fn infer_email_triage_mode(utterance: &str) -> EmailTriageMode {
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

fn is_inbox_triage_utterance(utterance: &str) -> bool {
    let text = utterance.to_ascii_lowercase();
    text.contains("inbox triage")
        || (text.contains("triage") && contains_any(&text, &["inbox", "email", "mail"]))
}

fn objective_from_utterance(utterance: &str) -> String {
    if is_inbox_triage_utterance(utterance) {
        "Run read-only inbox triage".to_string()
    } else {
        utterance.to_string()
    }
}

fn contains_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

fn empty_snapshot(session_id: SessionId, next_sequence: u64) -> ControlPlaneSessionSnapshot {
    ControlPlaneSessionSnapshot {
        protocol_version: CONTROL_PLANE_PROTOCOL_VERSION.to_string(),
        session_id,
        objective_id: None,
        active_graph_id: None,
        plan_revision: 0,
        next_sequence,
        task_graphs: Vec::new(),
        artifacts: Vec::new(),
        pending_approvals: Vec::new(),
        recent_events: Vec::new(),
    }
}

fn default_sqlite_path() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("Library")
        .join("Application Support")
        .join("Adaptive Surface")
        .join("control-plane.sqlite3")
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
struct FixtureMailMetadataProvider {
    messages: Vec<AppleMailMessage>,
}

#[cfg(test)]
impl MailMetadataProvider for FixtureMailMetadataProvider {
    fn search(&self, _limit: usize, _unread_first: bool) -> Result<Vec<AppleMailMessage>, ControlPlaneError> {
        Ok(self.messages.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mail_message(id: &str, subject: &str, unread: bool) -> AppleMailMessage {
        AppleMailMessage {
            id: id.to_string(),
            mailbox: "Inbox".to_string(),
            subject: subject.to_string(),
            sender: "Alex <alex@example.com>".to_string(),
            received_at: Some("2026-06-23T09:00:00Z".to_string()),
            is_read: !unread,
            preview: Some("Please approve the invoice before Friday.".to_string()),
        }
    }

    #[test]
    fn submit_inbox_triage_builds_ordered_events_and_artifact() {
        let mut service = ControlPlaneService::with_fixture_mail(vec![
            mail_message("mail-1", "Invoice approval needed", true),
            mail_message("mail-2", "Planning notes", false),
        ]);
        let response = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Plan the next steps for inbox triage.".to_string(),
                session_id: None,
                client_request_id: Some("request-1".to_string()),
                model_intent_hint: None,
                now_ms: Some(10_000),
            })
            .expect("triage should run");

        assert_eq!(response.route, SubmitObjectiveRoute::Handled);
        assert!(response
            .events
            .windows(2)
            .all(|pair| pair[0].sequence < pair[1].sequence));
        assert_eq!(response.snapshot.artifacts.len(), 1);
        assert_eq!(response.snapshot.artifacts[0].metadata["fullBodiesRead"], "false");
        assert!(response.snapshot.artifacts[0].body.as_ref().unwrap().contains("## Operating Plan"));
    }

    #[test]
    fn runtime_event_payload_serializes_camel_case_fields() {
        let lifecycle = RuntimeEventPayload::WorkUnitLifecycle {
            work_unit_id: WorkUnitId::new("unit-1"),
            state: OperationState::Running,
            progress: 50,
            message: "running".to_string(),
        };
        let lifecycle_json = serde_json::to_value(lifecycle).expect("payload should serialize");
        assert_eq!(lifecycle_json["data"]["workUnitId"], "unit-1");
        assert!(lifecycle_json["data"].get("work_unit_id").is_none());

        let approval = RuntimeEventPayload::ApprovalResolved {
            approval_id: ApprovalId::new("approval-1"),
            decision: ApprovalDecision::Approve,
        };
        let approval_json = serde_json::to_value(approval).expect("payload should serialize");
        assert_eq!(approval_json["data"]["approvalId"], "approval-1");
        assert!(approval_json["data"].get("approval_id").is_none());

        let conflict = RuntimeEventPayload::ConflictDetected {
            message: "blocked".to_string(),
            safe_diagnostic: SafeDiagnostic {
                code: "policy_blocked".to_string(),
                message: "blocked".to_string(),
                retryable: false,
            },
        };
        let conflict_json = serde_json::to_value(conflict).expect("payload should serialize");
        assert_eq!(conflict_json["data"]["safeDiagnostic"]["code"], "policy_blocked");
        assert!(conflict_json["data"].get("safe_diagnostic").is_none());
    }

    #[test]
    fn non_migrated_utterance_does_not_record_raw_text_before_legacy_fallback() {
        let mut service = ControlPlaneService::with_fixture_mail(Vec::new());
        let response = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "draft an email to Jacob".to_string(),
                session_id: None,
                client_request_id: None,
                model_intent_hint: None,
                now_ms: Some(11_000),
            })
            .expect("fallback should be recorded");

        assert_eq!(response.route, SubmitObjectiveRoute::LegacyFallback);
        assert!(response.events.iter().any(|event| matches!(
            event.payload,
            RuntimeEventPayload::LegacyFallbackRequested { .. }
        )));
        assert!(!response.events.iter().any(|event| matches!(
            event.payload,
            RuntimeEventPayload::ObjectiveAccepted { .. }
        )));
        let event_json = serde_json::to_string(&response.events).expect("events should serialize");
        assert!(!event_json.contains("draft an email to Jacob"));
    }

    #[test]
    fn duplicate_client_request_is_idempotent() {
        let mut service = ControlPlaneService::with_fixture_mail(vec![mail_message("mail-1", "A", true)]);
        let input = SubmitObjectiveInput {
            utterance: "Catch me up on inbox triage.".to_string(),
            session_id: None,
            client_request_id: Some("same-request".to_string()),
            model_intent_hint: None,
            now_ms: Some(12_000),
        };
        let first = service.submit_final_utterance(input.clone()).expect("first should run");
        let duplicate = service.submit_final_utterance(input).expect("duplicate should not rerun");
        assert!(!first.events.is_empty());
        assert!(duplicate.events.is_empty());
    }

    #[test]
    fn in_memory_repository_replays_session_snapshot() {
        let mut repository = InMemoryControlPlaneRepository::new();
        let snapshot = empty_snapshot(SessionId::new("session-1"), 1);
        repository.save_snapshot(&snapshot).expect("snapshot should save");
        let loaded = repository.load_snapshots().expect("snapshot should load");
        assert_eq!(loaded[0].session_id, SessionId::new("session-1"));
    }

    #[test]
    fn sqlite_repository_reconstructs_service_snapshot() {
        let path = std::env::temp_dir().join("adaptive-surface-control-plane-test.sqlite3");
        let _ = std::fs::remove_file(&path);
        let session_id = {
            let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should open");
            let mut service = ControlPlaneService::new(
                Box::new(repository),
                Box::new(FixtureMailMetadataProvider {
                    messages: vec![mail_message("mail-1", "Invoice approval needed", true)],
                }),
            )
            .expect("service should initialize");
            let response = service
                .submit_final_utterance(SubmitObjectiveInput {
                    utterance: "Catch me up on inbox triage.".to_string(),
                    session_id: None,
                    client_request_id: None,
                    model_intent_hint: None,
                    now_ms: Some(13_000),
                })
                .expect("triage should run");
            response.session_id
        };

        let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should reopen");
        let mut service = ControlPlaneService::new(
            Box::new(repository),
            Box::new(FixtureMailMetadataProvider { messages: Vec::new() }),
        )
        .expect("service should replay");
        let snapshot = service
            .get_session_snapshot(session_id.clone())
            .expect("snapshot should reconstruct");
        let _ = std::fs::remove_file(&path);

        assert_eq!(snapshot.session_id, session_id);
        assert_eq!(snapshot.artifacts.len(), 1);
        assert!(snapshot.next_sequence > 1);
    }

    #[test]
    fn sqlite_replay_ignores_corrupt_or_future_events() {
        let path = std::env::temp_dir().join("adaptive-surface-control-plane-corrupt-test.sqlite3");
        let _ = std::fs::remove_file(&path);
        let mut repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should open");
        {
            let connection = rusqlite::Connection::open(&path).expect("sqlite direct open should work");
            connection
                .execute(
                    "insert into runtime_events
                     (event_id, sequence, session_id, objective_id, occurred_at_ms, payload_json)
                     values (?1, ?2, ?3, ?4, ?5, ?6)",
                    params!["future-event", 1_i64, "session", "objective", 1_i64, "{\"protocolVersion\":\"future\"}"],
                )
                .expect("future event should insert");
            connection
                .execute(
                    "insert into runtime_events
                     (event_id, sequence, session_id, objective_id, occurred_at_ms, payload_json)
                     values (?1, ?2, ?3, ?4, ?5, ?6)",
                    params!["bad-event", 2_i64, "session", "objective", 1_i64, "not-json"],
                )
                .expect("bad event should insert");
        }
        let events = repository.load_events().expect("replay should not fail");
        let _ = std::fs::remove_file(&path);
        assert!(events.is_empty());
    }

    #[test]
    fn migrated_capabilities_are_canonical_and_safe_for_inbox_slice() {
        let capabilities = ControlPlaneService::canonical_capabilities();
        let mail = capabilities
            .iter()
            .find(|capability| capability.capability_id == "mail.search")
            .expect("mail.search should exist");
        assert_eq!(mail.side_effect_class, SideEffectClass::None);
        assert_eq!(mail.approval_requirement, ApprovalRequirement::None);
        assert!(capabilities.iter().any(|capability| capability.capability_id == "artifact.create"));
    }
}
