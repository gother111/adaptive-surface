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
        let approval_id = command.approval_id.clone().ok_or_else(|| {
            ControlPlaneError::new(ControlPlaneErrorKind::PolicyBlocked, "approval id is required")
        })?;
        let mut store = self.journal.lock_store()?;
        let mut snapshot = store
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
        if approval.plan_revision != command.plan_revision {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::PolicyBlocked,
                "approval request does not match the current plan revision",
            ));
        }
        snapshot.pending_approvals.retain(|approval| approval.approval_id != approval_id.as_str());
        store.repository.save_events_and_snapshot(&[], &snapshot)?;
        store.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
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
}
