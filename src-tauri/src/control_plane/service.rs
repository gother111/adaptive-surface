use super::authorization::validate_approval_binding;
use super::contracts::*;
use super::executors::{
    build_inbox_triage_graph, canonical_capabilities, infer_email_triage_mode,
    is_inbox_triage_utterance, objective_from_utterance, AppleMailMetadataProvider,
    ExecutorRegistry, MailMetadataProvider,
};
use super::journal::{epoch_ms, RuntimeJournal};
use super::publisher::{RuntimeEventPublisher, SharedEventPublisher};
use super::repository::{
    ControlPlaneRepository, InMemoryControlPlaneRepository, SqliteControlPlaneRepository,
};
use super::scheduler::{SchedulerConfig, SchedulerRun, TaskScheduler};
use std::path::PathBuf;
use std::sync::Arc;

pub struct ControlPlaneService {
    journal: RuntimeJournal,
    scheduler: TaskScheduler,
}

impl ControlPlaneService {
    pub fn new_app() -> Result<Self, ControlPlaneError> {
        let repository = SqliteControlPlaneRepository::open(default_sqlite_path())?;
        Self::new(
            Box::new(repository),
            Arc::new(AppleMailMetadataProvider),
            SchedulerConfig::default(),
        )
    }

    pub fn in_memory() -> Self {
        Self::new(
            Box::new(InMemoryControlPlaneRepository::new()),
            Arc::new(AppleMailMetadataProvider),
            SchedulerConfig::default(),
        )
        .unwrap_or_else(|error| panic!("in-memory control-plane repository should initialize: {}", error.message))
    }

    pub fn new(
        repository: Box<dyn ControlPlaneRepository>,
        mail_provider: Arc<dyn MailMetadataProvider>,
        scheduler_config: SchedulerConfig,
    ) -> Result<Self, ControlPlaneError> {
        let publisher = SharedEventPublisher::noop();
        let journal = RuntimeJournal::new(repository, publisher)?;
        journal.mark_interrupted_requests(epoch_ms())?;
        let registry = ExecutorRegistry::inbox(mail_provider);
        let scheduler = TaskScheduler::new(journal.clone(), registry, scheduler_config);
        Ok(Self { journal, scheduler })
    }

    pub fn set_event_publisher(
        &self,
        publisher: Arc<dyn RuntimeEventPublisher>,
    ) -> Result<(), ControlPlaneError> {
        self.journal.set_publisher(publisher)
    }

    #[cfg(test)]
    pub fn with_fixture_mail(messages: Vec<crate::apple::models::AppleMailMessage>) -> Self {
        Self::new(
            Box::new(InMemoryControlPlaneRepository::new()),
            Arc::new(super::executors::FixtureMailMetadataProvider { messages }),
            SchedulerConfig {
                max_concurrency: 2,
                poll_interval_ms: 1,
                ..SchedulerConfig::default()
            },
        )
        .unwrap_or_else(|error| panic!("fixture service should initialize: {}", error.message))
    }

    pub fn canonical_capabilities() -> Vec<SemanticCapabilityDescriptor> {
        canonical_capabilities()
    }

    pub fn submit_final_utterance(
        &self,
        input: SubmitObjectiveInput,
    ) -> Result<SubmitObjectiveResponse, ControlPlaneError> {
        let utterance = input.utterance.trim().to_string();
        if utterance.is_empty() {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "final utterance cannot be empty",
            ));
        }

        if let Some(response) = self.duplicate_response(&input)? {
            return Ok(response);
        }

        if !is_inbox_triage_utterance(&utterance) {
            return self.record_legacy_fallback(input, utterance);
        }

        self.accept_inbox_triage(input, utterance)
    }

    pub fn cancel_operation(
        &self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        self.scheduler.cancel_operation(command)
    }

    pub fn approve_operation(
        &self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let now_ms = command.now_ms.unwrap_or_else(epoch_ms);
        let approval_id = command.approval_id.clone().ok_or_else(|| {
            ControlPlaneError::new(ControlPlaneErrorKind::PolicyBlocked, "approval id is required")
        })?;
        let (event, snapshot) = {
            let mut store = self.journal.lock_store()?;
            let snapshot = store
                .sessions
                .get(&command.session_id)
                .cloned()
                .ok_or_else(|| {
                    ControlPlaneError::new(
                        ControlPlaneErrorKind::RecoveryRequiresVerification,
                        format!("session {} was not found", command.session_id),
                    )
                })?;
            let approval = snapshot
                .pending_approvals
                .iter()
                .find(|approval| approval.approval_id == approval_id.as_str())
                .cloned()
                .ok_or_else(|| {
                    ControlPlaneError::new(ControlPlaneErrorKind::PolicyBlocked, "approval request was not found")
                })?;

            if approval.plan_revision != command.plan_revision || snapshot.plan_revision != command.plan_revision {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::PolicyBlocked,
                    "approval request does not match the current plan revision",
                ));
            }

            let graph_id = snapshot
                .active_graph_id
                .clone()
                .unwrap_or_else(|| TaskGraphId::new(approval.plan_id.clone()));
            let mut graph = snapshot
                .task_graphs
                .iter()
                .find(|graph| graph.graph_id == graph_id || graph.graph_id.as_str() == approval.plan_id)
                .cloned()
                .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "approval graph was not found"))?;
            let operation = graph
                .work_units
                .iter()
                .find(|unit| unit.work_unit_id == command.work_unit_id)
                .cloned()
                .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "approval operation was not found"))?;

            if operation.state != OperationState::AwaitingApproval {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "operation is not waiting for approval",
                ));
            }

            validate_approval_binding(&graph, &operation, &approval, now_ms)?;

            if let Some(unit) = graph
                .work_units
                .iter_mut()
                .find(|unit| unit.work_unit_id == command.work_unit_id)
            {
                unit.state = OperationState::Ready;
            }

            let objective_id = snapshot.objective_id.clone().ok_or_else(|| {
                ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "snapshot missing objective")
            })?;
            let run_id = snapshot
                .recent_events
                .iter()
                .rev()
                .find(|event| event.graph_id.as_ref().is_some_and(|event_graph_id| event_graph_id == &graph_id))
                .map(|event| event.run_id.clone())
                .unwrap_or_else(|| store.id("run-approval", now_ms, RunId::new));
            let pending_approvals = snapshot
                .pending_approvals
                .into_iter()
                .filter(|pending| pending.approval_id != approval_id.as_str())
                .collect::<Vec<_>>();
            let event = store.record_event(
                &command.session_id,
                &objective_id,
                command.plan_revision,
                Some(graph.graph_id.clone()),
                Some(command.work_unit_id.clone()),
                &run_id,
                now_ms,
                RuntimeEventPayload::ApprovalResolved {
                    approval_id,
                    decision: ApprovalDecision::Approve,
                },
            );
            let snapshot = store.save_snapshot(
                command.session_id.clone(),
                Some(objective_id),
                Some(graph),
                command.plan_revision,
                Vec::new(),
                pending_approvals,
                std::slice::from_ref(&event),
                None,
            )?;
            (event, snapshot)
        };
        self.journal.publish_events(std::slice::from_ref(&event));
        Ok(snapshot)
    }

    pub fn reject_operation(
        &self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        self.cancel_operation(command)
    }

    pub fn get_session_snapshot(
        &self,
        session_id: SessionId,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        self.journal.get_session_snapshot(session_id)
    }

    pub fn get_runtime_events_after(
        &self,
        input: RuntimeEventsAfterInput,
    ) -> Result<RuntimeEventsAfterResponse, ControlPlaneError> {
        self.journal.get_runtime_events_after(input)
    }

    pub fn list_pending_approvals(&self) -> Result<Vec<ApprovalRequest>, ControlPlaneError> {
        self.journal.list_pending_approvals()
    }

    fn duplicate_response(
        &self,
        input: &SubmitObjectiveInput,
    ) -> Result<Option<SubmitObjectiveResponse>, ControlPlaneError> {
        let Some(client_request_id) = &input.client_request_id else {
            return Ok(None);
        };
        let request_fingerprint = request_fingerprint(&input.utterance);
        let mut store = self.journal.lock_store()?;
        let Some(record) = store.repository.load_request(client_request_id)? else {
            return Ok(None);
        };
        if !record.request_fingerprint.is_empty() && record.request_fingerprint != request_fingerprint {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::DuplicateDispatch,
                "client request id was already used for a different request",
            ));
        }
        let snapshot = store
            .sessions
            .get(&record.session_id)
            .cloned()
            .unwrap_or_else(|| store.active_snapshot(Some(record.session_id.clone())));
        Ok(Some(SubmitObjectiveResponse {
            route: if record.graph_id.is_some() {
                SubmitObjectiveRoute::Handled
            } else {
                SubmitObjectiveRoute::LegacyFallback
            },
            session_id: record.session_id,
            objective_id: record.objective_id,
            run_id: record.run_id,
            graph_id: record.graph_id,
            plan_revision: record.plan_revision,
            accepted_sequence: snapshot.next_sequence.saturating_sub(1),
            completed: matches!(
                record.status,
                RequestStatus::Completed
                    | RequestStatus::FailedRetryable
                    | RequestStatus::FailedTerminal
                    | RequestStatus::Cancelled
                    | RequestStatus::TimedOut
            ),
            events: Vec::new(),
            pending_approvals: snapshot.pending_approvals.clone(),
            snapshot,
        }))
    }

    fn record_legacy_fallback(
        &self,
        input: SubmitObjectiveInput,
        utterance: String,
    ) -> Result<SubmitObjectiveResponse, ControlPlaneError> {
        let now_ms = input.now_ms.unwrap_or_else(epoch_ms);
        let (events, snapshot, run_id) = {
            let mut store = self.journal.lock_store()?;
            let session_id = input
                .session_id
                .clone()
                .or_else(|| store.active_session_id.clone())
                .unwrap_or_else(|| store.id("session", now_ms, SessionId::new));
            let objective_id = store
                .sessions
                .get(&session_id)
                .and_then(|snapshot| snapshot.objective_id.clone())
                .unwrap_or_else(|| store.id("objective", now_ms, ObjectiveId::new));
            let run_id = store.id("run", now_ms, RunId::new);
            let plan_revision = store
                .sessions
                .get(&session_id)
                .map(|snapshot| snapshot.plan_revision.saturating_add(1))
                .unwrap_or(1);
            let fallback_event = store.record_event(
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
            );
            let completed = store.record_event(
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
            );
            let events = vec![fallback_event, completed];
            let request = input.client_request_id.clone().map(|client_request_id| RequestLedgerRecord {
                client_request_id,
                request_fingerprint: request_fingerprint(&utterance),
                session_id: session_id.clone(),
                objective_id: objective_id.clone(),
                run_id: run_id.clone(),
                graph_id: None,
                plan_revision,
                status: RequestStatus::Completed,
                accepted_at_ms: now_ms,
                terminal_at_ms: Some(now_ms),
                safe_diagnostic: None,
            });
            let snapshot = store.save_snapshot(
                session_id,
                Some(objective_id),
                None,
                plan_revision,
                Vec::new(),
                Vec::new(),
                &events,
                request.as_ref(),
            )?;
            (events, snapshot, run_id)
        };
        self.journal.publish_events(&events);
        Ok(SubmitObjectiveResponse {
            route: SubmitObjectiveRoute::LegacyFallback,
            session_id: snapshot.session_id.clone(),
            objective_id: snapshot
                .objective_id
                .clone()
                .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "snapshot missing objective"))?,
            run_id,
            graph_id: None,
            plan_revision: snapshot.plan_revision,
            accepted_sequence: events.first().map(|event| event.sequence).unwrap_or(0),
            completed: true,
            events,
            pending_approvals: snapshot.pending_approvals.clone(),
            snapshot,
        })
    }

    fn accept_inbox_triage(
        &self,
        input: SubmitObjectiveInput,
        utterance: String,
    ) -> Result<SubmitObjectiveResponse, ControlPlaneError> {
        let now_ms = input.now_ms.unwrap_or_else(epoch_ms);
        let accepted = {
            let mut store = self.journal.lock_store()?;
            let session_id = input
                .session_id
                .clone()
                .or_else(|| store.active_session_id.clone())
                .unwrap_or_else(|| store.id("session", now_ms, SessionId::new));
            let objective_id = store
                .sessions
                .get(&session_id)
                .and_then(|snapshot| snapshot.objective_id.clone())
                .unwrap_or_else(|| store.id("objective", now_ms, ObjectiveId::new));
            let run_id = store.id("run", now_ms, RunId::new);
            let graph_id = store.id("graph", now_ms, TaskGraphId::new);
            let plan_revision = store
                .sessions
                .get(&session_id)
                .map(|snapshot| snapshot.plan_revision.saturating_add(1))
                .unwrap_or(1);
            let mode = infer_email_triage_mode(&utterance);
            let graph = build_inbox_triage_graph(
                graph_id.clone(),
                session_id.clone(),
                objective_id.clone(),
                plan_revision,
                now_ms,
                &utterance,
                mode,
                store.id("work-mail-search", now_ms, WorkUnitId::new),
                store.id("work-triage-classify", now_ms, WorkUnitId::new),
                store.id("work-artifact-create", now_ms, WorkUnitId::new),
            );
            self.scheduler.validate_graph(&graph)?;

            let objective_event = store.record_event(
                &session_id,
                &objective_id,
                plan_revision,
                Some(graph_id.clone()),
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
            );
            let plan_event = store.record_event(
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
            );
            let events = vec![objective_event, plan_event];
            let request = input.client_request_id.clone().map(|client_request_id| RequestLedgerRecord {
                client_request_id,
                request_fingerprint: request_fingerprint(&utterance),
                session_id: session_id.clone(),
                objective_id: objective_id.clone(),
                run_id: run_id.clone(),
                graph_id: Some(graph_id.clone()),
                plan_revision,
                status: RequestStatus::Accepted,
                accepted_at_ms: now_ms,
                terminal_at_ms: None,
                safe_diagnostic: None,
            });
            let snapshot = store.save_snapshot(
                session_id.clone(),
                Some(objective_id.clone()),
                Some(graph.clone()),
                plan_revision,
                Vec::new(),
                Vec::new(),
                &events,
                request.as_ref(),
            )?;
            AcceptedRun {
                response: SubmitObjectiveResponse {
                    route: SubmitObjectiveRoute::Handled,
                    session_id: session_id.clone(),
                    objective_id: objective_id.clone(),
                    run_id: run_id.clone(),
                    graph_id: Some(graph_id.clone()),
                    plan_revision,
                    accepted_sequence: events.first().map(|event| event.sequence).unwrap_or(0),
                    completed: false,
                    events: events.clone(),
                    pending_approvals: snapshot.pending_approvals.clone(),
                    snapshot,
                },
                scheduler_run: SchedulerRun {
                    client_request_id: input.client_request_id.clone(),
                    session_id,
                    objective_id,
                    graph_id,
                    run_id,
                    plan_revision,
                    graph,
                },
                events,
            }
        };

        self.scheduler.enqueue(accepted.scheduler_run)?;
        self.journal.publish_events(&accepted.events);
        Ok(accepted.response)
    }
}

struct AcceptedRun {
    response: SubmitObjectiveResponse,
    scheduler_run: SchedulerRun,
    events: Vec<RuntimeEventEnvelope>,
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

fn request_fingerprint(utterance: &str) -> String {
    let normalized = utterance.to_ascii_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in normalized.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::apple::models::AppleMailMessage;
    use crate::control_plane::authorization::approval_binding_for_work_unit;
    use std::thread;
    use std::time::{Duration, Instant};

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

    fn wait_for_terminal(service: &ControlPlaneService, session_id: &SessionId) -> ControlPlaneSessionSnapshot {
        let start = Instant::now();
        loop {
            let snapshot = service
                .get_session_snapshot(session_id.clone())
                .expect("snapshot should exist");
            if snapshot
                .recent_events
                .iter()
                .any(|event| matches!(event.payload, RuntimeEventPayload::ExecutionCompleted { .. }))
            {
                return snapshot;
            }
            assert!(start.elapsed() < Duration::from_secs(2));
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn approval_unit() -> WorkUnit {
        let mut input = Metadata::new();
        input.insert("target".to_string(), "alex@example.com".to_string());
        input.insert("body".to_string(), "Follow up draft.".to_string());
        WorkUnit {
            work_unit_id: WorkUnitId::new("send-approval"),
            kind: WorkUnitKind::PureSynthesis,
            capability_id: "mail.send".to_string(),
            title: "Send approved message".to_string(),
            dependencies: Vec::new(),
            join_policy: JoinPolicy::AllSucceeded,
            execution_policy: ExecutionPolicy {
                timeout_ms: 1_000,
                approval_requirement: ApprovalRequirement::ExplicitUserApproval,
                side_effect_class: SideEffectClass::ExternalConsequential,
                retry_policy: RetryPolicy {
                    max_attempts: 1,
                    retry_idempotent_only: true,
                },
                idempotency_key: None,
                supports_cancellation: false,
            },
            input,
            state: OperationState::AwaitingApproval,
        }
    }

    fn approval_graph(unit: WorkUnit) -> TaskGraph {
        TaskGraph {
            graph_id: TaskGraphId::new("approval-graph"),
            session_id: SessionId::new("approval-session"),
            objective_id: ObjectiveId::new("approval-objective"),
            plan_revision: 3,
            work_units: vec![unit],
            created_at_ms: 1,
        }
    }

    fn approval_request(graph: &TaskGraph, unit: &WorkUnit) -> ApprovalRequest {
        let expected_effect = "Send one prepared message.".to_string();
        let data_disclosure = "Message body leaves Adaptive Surface through mail.".to_string();
        let expires_at_ms = 100;
        ApprovalRequest {
            approval_id: "approval-once".to_string(),
            session_id: graph.session_id.to_string(),
            operation_id: unit.work_unit_id.to_string(),
            plan_id: graph.graph_id.to_string(),
            plan_revision: graph.plan_revision,
            capability_id: unit.capability_id.clone(),
            commitment_tier: CommitmentTier::Commit,
            actor: ApprovalActor::User,
            target: "alex@example.com".to_string(),
            scope: "single prepared message".to_string(),
            expected_effect: expected_effect.clone(),
            data_disclosure: data_disclosure.clone(),
            reversibility: "not reliably reversible".to_string(),
            reason: "External write requires one-time approval.".to_string(),
            side_effect_class: Some(SideEffectClass::ExternalConsequential),
            preview: unit.input.clone(),
            expires_at_ms,
            binding: Some(approval_binding_for_work_unit(
                "approval-once",
                graph,
                unit,
                expires_at_ms,
                &expected_effect,
                &data_disclosure,
                Some(1),
            )),
        }
    }

    #[test]
    fn submit_returns_after_durable_acceptance_before_terminal_completion() {
        let service = ControlPlaneService::with_fixture_mail(vec![mail_message("mail-1", "A", true)]);
        let response = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Catch me up on inbox triage.".to_string(),
                session_id: None,
                client_request_id: Some("request-1".to_string()),
                model_intent_hint: None,
                now_ms: Some(10_000),
            })
            .expect("triage should be accepted");

        assert_eq!(response.route, SubmitObjectiveRoute::Handled);
        assert!(!response.completed);
        assert_eq!(response.events.len(), 2);
        let snapshot = wait_for_terminal(&service, &response.session_id);
        assert_eq!(snapshot.artifacts.len(), 1);
    }

    #[test]
    fn non_migrated_utterance_does_not_record_raw_text_before_legacy_fallback() {
        let service = ControlPlaneService::with_fixture_mail(Vec::new());
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
        assert!(response.completed);
        let event_json = serde_json::to_string(&response.events).expect("events should serialize");
        assert!(!event_json.contains("draft an email to Jacob"));
    }

    #[test]
    fn duplicate_client_request_while_original_running_does_not_dispatch_twice() {
        let service = ControlPlaneService::with_fixture_mail(vec![mail_message("mail-1", "A", true)]);
        let input = SubmitObjectiveInput {
            utterance: "Catch me up on inbox triage.".to_string(),
            session_id: None,
            client_request_id: Some("same-request".to_string()),
            model_intent_hint: None,
            now_ms: Some(12_000),
        };
        let first = service.submit_final_utterance(input.clone()).expect("first should accept");
        let duplicate = service.submit_final_utterance(input).expect("duplicate should not rerun");
        assert_eq!(first.run_id, duplicate.run_id);
        assert!(duplicate.events.is_empty());
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
    }

    #[test]
    fn approval_command_consumes_exact_approval_once() {
        let service = ControlPlaneService::with_fixture_mail(Vec::new());
        let unit = approval_unit();
        let graph = approval_graph(unit.clone());
        let approval = approval_request(&graph, &unit);
        {
            let mut store = service.journal.lock_store().expect("journal lock should work");
            store
                .save_snapshot(
                    graph.session_id.clone(),
                    Some(graph.objective_id.clone()),
                    Some(graph.clone()),
                    graph.plan_revision,
                    Vec::new(),
                    vec![approval],
                    &[],
                    None,
                )
                .expect("approval snapshot should persist");
        }

        let command = OperationCommand {
            session_id: graph.session_id.clone(),
            work_unit_id: unit.work_unit_id.clone(),
            plan_revision: graph.plan_revision,
            approval_id: Some(ApprovalId::new("approval-once")),
            now_ms: Some(50),
        };
        let approved = service
            .approve_operation(command.clone())
            .expect("exact approval should be consumed");
        assert!(approved.pending_approvals.is_empty());
        let approved_unit = approved
            .task_graphs
            .iter()
            .find(|candidate| candidate.graph_id == graph.graph_id)
            .and_then(|candidate| candidate.work_units.iter().find(|candidate| candidate.work_unit_id == unit.work_unit_id))
            .expect("approved unit should exist");
        assert_eq!(approved_unit.state, OperationState::Ready);

        let replay = service
            .approve_operation(command)
            .expect_err("consumed approval must not replay");
        assert_eq!(replay.kind, ControlPlaneErrorKind::PolicyBlocked);
    }

    #[test]
    fn get_runtime_events_after_returns_ordered_catch_up_page() {
        let service = ControlPlaneService::with_fixture_mail(vec![mail_message("mail-1", "A", true)]);
        let response = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Catch me up on inbox triage.".to_string(),
                session_id: None,
                client_request_id: None,
                model_intent_hint: None,
                now_ms: Some(13_000),
            })
            .expect("triage should accept");
        let events = service
            .get_runtime_events_after(RuntimeEventsAfterInput {
                session_id: response.session_id.clone(),
                after_sequence: 0,
                limit: Some(10),
            })
            .expect("catch-up should load")
            .events;
        assert!(events.windows(2).all(|pair| pair[0].sequence < pair[1].sequence));
        assert!(events.len() >= 2);
    }

    #[test]
    fn runtime_event_sequences_are_contiguous_per_session() {
        let service = ControlPlaneService::with_fixture_mail(vec![mail_message("mail-1", "A", true)]);
        let session_a = SessionId::new("session-a");
        let session_b = SessionId::new("session-b");

        let first_a = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Catch me up on inbox triage.".to_string(),
                session_id: Some(session_a.clone()),
                client_request_id: Some("request-a-1".to_string()),
                model_intent_hint: None,
                now_ms: Some(13_100),
            })
            .expect("first session A run should accept");
        let _ = wait_for_terminal(&service, &first_a.session_id);

        let first_b = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Catch me up on inbox triage.".to_string(),
                session_id: Some(session_b.clone()),
                client_request_id: Some("request-b-1".to_string()),
                model_intent_hint: None,
                now_ms: Some(13_200),
            })
            .expect("session B run should accept");
        let _ = wait_for_terminal(&service, &first_b.session_id);

        let second_a = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Plan the next steps for inbox triage.".to_string(),
                session_id: Some(session_a.clone()),
                client_request_id: Some("request-a-2".to_string()),
                model_intent_hint: None,
                now_ms: Some(13_300),
            })
            .expect("second session A run should accept");
        let _ = wait_for_terminal(&service, &second_a.session_id);

        let events_a = service
            .get_runtime_events_after(RuntimeEventsAfterInput {
                session_id: session_a,
                after_sequence: 0,
                limit: Some(500),
            })
            .expect("session A catch-up should load")
            .events;
        let events_b = service
            .get_runtime_events_after(RuntimeEventsAfterInput {
                session_id: session_b,
                after_sequence: 0,
                limit: Some(500),
            })
            .expect("session B catch-up should load")
            .events;

        assert_eq!(events_a.first().map(|event| event.sequence), Some(1));
        assert_eq!(events_b.first().map(|event| event.sequence), Some(1));
        assert!(events_a
            .windows(2)
            .all(|pair| pair[1].sequence == pair[0].sequence.saturating_add(1)));
        assert!(events_b
            .windows(2)
            .all(|pair| pair[1].sequence == pair[0].sequence.saturating_add(1)));
    }

    #[test]
    fn restart_seeds_generated_ids_from_replayed_event_history() {
        let path = std::env::temp_dir().join(format!(
            "adaptive-surface-control-plane-id-seed-{}.sqlite3",
            epoch_ms()
        ));
        let _ = std::fs::remove_file(&path);
        {
            let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should open");
            let service = ControlPlaneService::new(
                Box::new(repository),
                Arc::new(super::super::executors::FixtureMailMetadataProvider { messages: Vec::new() }),
                SchedulerConfig {
                    max_concurrency: 2,
                    poll_interval_ms: 1,
                    ..SchedulerConfig::default()
                },
            )
            .expect("service should initialize");
            for index in 0..14 {
                let response = service
                    .submit_final_utterance(SubmitObjectiveInput {
                        utterance: "Open the canvas".to_string(),
                        session_id: Some(SessionId::new(format!("seed-session-{index}"))),
                        client_request_id: Some(format!("seed-request-{index}")),
                        model_intent_hint: None,
                        now_ms: Some(18_000),
                    })
                    .expect("fallback should record");
                assert!(response.completed);
            }
        }

        let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should reopen");
        let service = ControlPlaneService::new(
            Box::new(repository),
            Arc::new(super::super::executors::FixtureMailMetadataProvider { messages: Vec::new() }),
            SchedulerConfig {
                max_concurrency: 2,
                poll_interval_ms: 1,
                ..SchedulerConfig::default()
            },
        )
        .expect("service should replay");
        let response = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Open the canvas".to_string(),
                session_id: Some(SessionId::new("seed-session-after-restart")),
                client_request_id: Some("seed-request-after-restart".to_string()),
                model_intent_hint: None,
                now_ms: Some(18_000),
            })
            .expect("restarted service should not reuse event ids");
        let _ = std::fs::remove_file(&path);

        assert!(response.completed);
        assert_eq!(response.events.len(), 2);
    }

    #[test]
    fn duplicate_client_request_after_restart_returns_original_run() {
        let path = std::env::temp_dir().join(format!(
            "adaptive-surface-control-plane-restart-{}.sqlite3",
            epoch_ms()
        ));
        let _ = std::fs::remove_file(&path);
        let first_run_id = {
            let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should open");
            let service = ControlPlaneService::new(
                Box::new(repository),
                Arc::new(super::super::executors::FixtureMailMetadataProvider {
                    messages: vec![mail_message("mail-1", "Invoice approval needed", true)],
                }),
                SchedulerConfig {
                    max_concurrency: 2,
                    poll_interval_ms: 1,
                    ..SchedulerConfig::default()
                },
            )
            .expect("service should initialize");
            let response = service
                .submit_final_utterance(SubmitObjectiveInput {
                    utterance: "Catch me up on inbox triage.".to_string(),
                    session_id: None,
                    client_request_id: Some("restart-request".to_string()),
                    model_intent_hint: None,
                    now_ms: Some(14_000),
                })
                .expect("triage should accept");
            let _snapshot = wait_for_terminal(&service, &response.session_id);
            response.run_id
        };

        let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should reopen");
        let service = ControlPlaneService::new(
            Box::new(repository),
            Arc::new(super::super::executors::FixtureMailMetadataProvider { messages: Vec::new() }),
            SchedulerConfig {
                max_concurrency: 2,
                poll_interval_ms: 1,
                ..SchedulerConfig::default()
            },
        )
        .expect("service should replay");
        let duplicate = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Catch me up on inbox triage.".to_string(),
                session_id: None,
                client_request_id: Some("restart-request".to_string()),
                model_intent_hint: None,
                now_ms: Some(15_000),
            })
            .expect("duplicate should resolve");
        let _ = std::fs::remove_file(&path);

        assert_eq!(duplicate.run_id, first_run_id);
        assert!(duplicate.events.is_empty());
        assert!(duplicate.completed);
    }

    #[test]
    fn interrupted_request_after_restart_returns_terminal_snapshot() {
        let path = std::env::temp_dir().join(format!(
            "adaptive-surface-control-plane-interrupted-{}.sqlite3",
            epoch_ms()
        ));
        let _ = std::fs::remove_file(&path);
        {
            let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should open");
            let journal = RuntimeJournal::new(
                Box::new(repository),
                super::super::publisher::SharedEventPublisher::noop(),
            )
            .expect("journal should initialize");
            let session_id = SessionId::new("interrupted-session");
            let objective_id = ObjectiveId::new("interrupted-objective");
            let run_id = RunId::new("interrupted-run");
            let graph_id = TaskGraphId::new("interrupted-graph");
            let graph = build_inbox_triage_graph(
                graph_id.clone(),
                session_id.clone(),
                objective_id.clone(),
                1,
                16_000,
                "Catch me up on inbox triage.",
                super::super::executors::EmailTriageMode::CatchUp,
                WorkUnitId::new("mail-search"),
                WorkUnitId::new("triage-classify"),
                WorkUnitId::new("artifact-create"),
            );
            let mut store = journal.lock_store().expect("journal lock should work");
            let accepted = store.record_event(
                &session_id,
                &objective_id,
                1,
                Some(graph_id.clone()),
                None,
                &run_id,
                16_000,
                RuntimeEventPayload::ObjectiveAccepted {
                    utterance: "Catch me up on inbox triage.".to_string(),
                    objective: "Run read-only inbox triage".to_string(),
                    routed_by: "test".to_string(),
                },
            );
            let planned = store.record_event(
                &session_id,
                &objective_id,
                1,
                Some(graph_id.clone()),
                None,
                &run_id,
                16_000,
                RuntimeEventPayload::PlanCreated {
                    graph: graph.clone(),
                    summary: "Created read-only inbox triage task graph.".to_string(),
                },
            );
            let request = RequestLedgerRecord {
                client_request_id: "interrupted-request".to_string(),
                request_fingerprint: request_fingerprint("Catch me up on inbox triage."),
                session_id: session_id.clone(),
                objective_id: objective_id.clone(),
                run_id: run_id.clone(),
                graph_id: Some(graph_id.clone()),
                plan_revision: 1,
                status: RequestStatus::Accepted,
                accepted_at_ms: 16_000,
                terminal_at_ms: None,
                safe_diagnostic: None,
            };
            store
                .save_snapshot(
                    session_id,
                    Some(objective_id),
                    Some(graph),
                    1,
                    Vec::new(),
                    Vec::new(),
                    &[accepted, planned],
                    Some(&request),
                )
                .expect("accepted snapshot should persist");
        }

        let repository = SqliteControlPlaneRepository::open(path.clone()).expect("sqlite should reopen");
        let service = ControlPlaneService::new(
            Box::new(repository),
            Arc::new(super::super::executors::FixtureMailMetadataProvider { messages: Vec::new() }),
            SchedulerConfig {
                max_concurrency: 2,
                poll_interval_ms: 1,
                ..SchedulerConfig::default()
            },
        )
        .expect("service should reconcile interrupted request");
        let duplicate = service
            .submit_final_utterance(SubmitObjectiveInput {
                utterance: "Catch me up on inbox triage.".to_string(),
                session_id: None,
                client_request_id: Some("interrupted-request".to_string()),
                model_intent_hint: None,
                now_ms: Some(17_000),
            })
            .expect("duplicate should resolve to interrupted run");
        let _ = std::fs::remove_file(&path);

        assert!(duplicate.completed);
        assert!(duplicate.events.is_empty());
        assert!(duplicate.snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::ExecutionCompleted {
                status: RuntimeTerminalStatus::Failed,
                ..
            }
        )));
        let graph = duplicate
            .snapshot
            .task_graphs
            .iter()
            .find(|graph| graph.graph_id.as_str() == "interrupted-graph")
            .expect("interrupted graph should remain available");
        assert!(graph
            .work_units
            .iter()
            .all(|unit| matches!(unit.state, OperationState::Failed)));
    }
}
