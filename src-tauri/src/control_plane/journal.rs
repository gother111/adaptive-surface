use super::contracts::*;
use super::publisher::{RuntimeEventPublisher, SharedEventPublisher};
use super::repository::{ControlPlaneRepository, RequestStatusUpdate};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct RuntimeJournal {
    store: Arc<Mutex<RuntimeStore>>,
    publisher: SharedEventPublisher,
}

pub struct RuntimeStore {
    pub repository: Box<dyn ControlPlaneRepository>,
    pub sessions: BTreeMap<SessionId, ControlPlaneSessionSnapshot>,
    pub active_session_id: Option<SessionId>,
    pub next_id: u64,
    pub next_sequence: u64,
    pub next_sequence_by_session: BTreeMap<SessionId, u64>,
}

impl RuntimeJournal {
    pub fn new(
        mut repository: Box<dyn ControlPlaneRepository>,
        publisher: SharedEventPublisher,
    ) -> Result<Self, ControlPlaneError> {
        let events = repository.load_events()?;
        let max_sequence = repository.max_event_sequence()?;
        let snapshots = repository.load_snapshots()?;
        let next_sequence = max_sequence.saturating_add(1);
        let max_event_id_suffix = events
            .iter()
            .filter_map(|event| generated_id_suffix(event.event_id.as_str()))
            .max()
            .unwrap_or(0);
        let next_id = max_event_id_suffix.max(
            max_sequence
                .max(events.len() as u64)
                .saturating_add(1)
                .saturating_mul(10),
        );
        let mut sessions = BTreeMap::new();
        let mut next_sequence_by_session = BTreeMap::new();
        for snapshot in snapshots {
            next_sequence_by_session
                .insert(snapshot.session_id.clone(), snapshot.next_sequence.max(1));
            sessions.insert(snapshot.session_id.clone(), snapshot);
        }
        let active_session_id = sessions.keys().next_back().cloned();

        Ok(Self {
            store: Arc::new(Mutex::new(RuntimeStore {
                repository,
                sessions,
                active_session_id,
                next_id,
                next_sequence,
                next_sequence_by_session,
            })),
            publisher,
        })
    }

    pub fn set_publisher(
        &self,
        publisher: Arc<dyn RuntimeEventPublisher>,
    ) -> Result<(), ControlPlaneError> {
        self.publisher.replace(publisher)
    }

    pub fn lock_store(&self) -> Result<MutexGuard<'_, RuntimeStore>, ControlPlaneError> {
        self.store.lock().map_err(|_| {
            ControlPlaneError::new(ControlPlaneErrorKind::Io, "runtime journal lock was poisoned")
        })
    }

    pub fn publish_events(&self, events: &[RuntimeEventEnvelope]) {
        for event in events {
            let _ = self.publisher.publish(event);
        }
    }

    pub fn get_session_snapshot(
        &self,
        session_id: SessionId,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let store = self.lock_store()?;
        store.sessions.get(&session_id).cloned().ok_or_else(|| {
            ControlPlaneError::new(
                ControlPlaneErrorKind::RecoveryRequiresVerification,
                format!("session {} was not found", session_id),
            )
        })
    }

    pub fn list_pending_approvals(&self) -> Result<Vec<ApprovalRequest>, ControlPlaneError> {
        let store = self.lock_store()?;
        Ok(store
            .sessions
            .values()
            .flat_map(|snapshot| snapshot.pending_approvals.clone())
            .collect())
    }

    pub fn get_runtime_events_after(
        &self,
        input: RuntimeEventsAfterInput,
    ) -> Result<RuntimeEventsAfterResponse, ControlPlaneError> {
        let limit = input.limit.unwrap_or(200).clamp(1, 500);
        let mut store = self.lock_store()?;
        let events = store
            .repository
            .load_events_after(&input.session_id, input.after_sequence, limit)?;
        let next_sequence = store
            .sessions
            .get(&input.session_id)
            .map(|snapshot| snapshot.next_sequence)
            .unwrap_or(store.next_sequence);
        Ok(RuntimeEventsAfterResponse {
            session_id: input.session_id,
            after_sequence: input.after_sequence,
            next_sequence,
            events,
        })
    }

    pub fn update_request_status(
        &self,
        client_request_id: Option<&str>,
        status: RequestStatus,
        terminal_at_ms: Option<u64>,
        safe_diagnostic: Option<SafeDiagnostic>,
    ) -> Result<(), ControlPlaneError> {
        let Some(client_request_id) = client_request_id else {
            return Ok(());
        };
        let mut store = self.lock_store()?;
        store
            .repository
            .update_request_status(client_request_id, status, terminal_at_ms, safe_diagnostic)
    }

    pub fn mark_interrupted_requests(&self, now_ms: u64) -> Result<(), ControlPlaneError> {
        let mut store = self.lock_store()?;
        let requests = store.repository.load_requests()?;
        for request in requests {
            if matches!(request.status, RequestStatus::Accepted | RequestStatus::Running) {
                store.mark_request_interrupted(request, now_ms)?;
            }
        }
        Ok(())
    }
}

impl RuntimeStore {
    pub fn id<T>(&mut self, prefix: &str, now_ms: u64, constructor: impl FnOnce(String) -> T) -> T {
        self.next_id = self.next_id.saturating_add(1);
        constructor(format!("{prefix}-{now_ms}-{}", self.next_id))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn record_event(
        &mut self,
        session_id: &SessionId,
        objective_id: &ObjectiveId,
        plan_revision: u64,
        graph_id: Option<TaskGraphId>,
        work_unit_id: Option<WorkUnitId>,
        run_id: &RunId,
        now_ms: u64,
        payload: RuntimeEventPayload,
    ) -> RuntimeEventEnvelope {
        let event_id = self.id("event", now_ms, RuntimeEventId::new);
        let sequence = self
            .next_sequence_by_session
            .entry(session_id.clone())
            .or_insert_with(|| {
                self.sessions
                    .get(session_id)
                    .map(|snapshot| snapshot.next_sequence)
                    .unwrap_or(1)
                    .max(1)
            });
        let event = RuntimeEventEnvelope {
            protocol_version: CONTROL_PLANE_PROTOCOL_VERSION.to_string(),
            event_id,
            sequence: *sequence,
            session_id: session_id.clone(),
            objective_id: objective_id.clone(),
            plan_revision,
            graph_id,
            work_unit_id,
            run_id: run_id.clone(),
            occurred_at_ms: now_ms,
            payload,
        };
        *sequence = (*sequence).saturating_add(1);
        self.next_sequence = self.next_sequence.max(*sequence);
        event
    }

    pub fn active_snapshot(&self, requested_session_id: Option<SessionId>) -> ControlPlaneSessionSnapshot {
        let session_id = requested_session_id
            .or_else(|| self.active_session_id.clone())
            .unwrap_or_else(|| SessionId::new("session-uninitialized"));
        self.sessions
            .get(&session_id)
            .cloned()
            .unwrap_or_else(|| {
                let next_sequence = self
                    .next_sequence_by_session
                    .get(&session_id)
                    .cloned()
                    .unwrap_or(1);
                empty_snapshot(session_id, next_sequence)
            })
    }

    pub fn save_snapshot(
        &mut self,
        session_id: SessionId,
        objective_id: Option<ObjectiveId>,
        graph: Option<TaskGraph>,
        plan_revision: u64,
        new_artifacts: Vec<ArtifactEnvelope>,
        pending_approvals: Vec<ApprovalRequest>,
        events: &[RuntimeEventEnvelope],
        request: Option<&RequestLedgerRecord>,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let mut snapshot = self
            .sessions
            .remove(&session_id)
            .unwrap_or_else(|| empty_snapshot(session_id.clone(), self.next_sequence));
        let stale_revision = snapshot.plan_revision > plan_revision;
        if !stale_revision {
            snapshot.objective_id = objective_id;
            snapshot.plan_revision = plan_revision;
        }
        if let Some(graph) = graph {
            if !stale_revision {
                snapshot.active_graph_id = Some(graph.graph_id.clone());
            }
            snapshot.task_graphs.retain(|existing| existing.graph_id != graph.graph_id);
            snapshot.task_graphs.push(graph);
        }
        snapshot.artifacts.extend(new_artifacts);
        if !stale_revision {
            snapshot.pending_approvals = pending_approvals;
        }
        snapshot.recent_events.extend(events.iter().cloned());
        if snapshot.recent_events.len() > 80 {
            let keep_from = snapshot.recent_events.len().saturating_sub(80);
            snapshot.recent_events = snapshot.recent_events.split_off(keep_from);
        }
        snapshot.next_sequence = self.next_sequence_for_session(&session_id);
        self.repository
            .save_events_snapshot_and_request(events, &snapshot, request)?;
        if !stale_revision {
            self.active_session_id = Some(snapshot.session_id.clone());
        }
        self.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
        Ok(snapshot)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn save_snapshot_and_request_status(
        &mut self,
        session_id: SessionId,
        objective_id: Option<ObjectiveId>,
        graph: Option<TaskGraph>,
        plan_revision: u64,
        new_artifacts: Vec<ArtifactEnvelope>,
        pending_approvals: Vec<ApprovalRequest>,
        events: &[RuntimeEventEnvelope],
        request_status: Option<RequestStatusUpdate<'_>>,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let mut snapshot = self
            .sessions
            .remove(&session_id)
            .unwrap_or_else(|| empty_snapshot(session_id.clone(), self.next_sequence));
        let stale_revision = snapshot.plan_revision > plan_revision;
        if !stale_revision {
            snapshot.objective_id = objective_id;
            snapshot.plan_revision = plan_revision;
        }
        if let Some(graph) = graph {
            if !stale_revision {
                snapshot.active_graph_id = Some(graph.graph_id.clone());
            }
            snapshot.task_graphs.retain(|existing| existing.graph_id != graph.graph_id);
            snapshot.task_graphs.push(graph);
        }
        snapshot.artifacts.extend(new_artifacts);
        if !stale_revision {
            snapshot.pending_approvals = pending_approvals;
        }
        snapshot.recent_events.extend(events.iter().cloned());
        if snapshot.recent_events.len() > 80 {
            let keep_from = snapshot.recent_events.len().saturating_sub(80);
            snapshot.recent_events = snapshot.recent_events.split_off(keep_from);
        }
        snapshot.next_sequence = self.next_sequence_for_session(&session_id);
        self.repository
            .save_events_snapshot_and_request_status(events, &snapshot, request_status)?;
        if !stale_revision {
            self.active_session_id = Some(snapshot.session_id.clone());
        }
        self.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
        Ok(snapshot)
    }

    fn next_sequence_for_session(&self, session_id: &SessionId) -> u64 {
        self.next_sequence_by_session
            .get(session_id)
            .cloned()
            .unwrap_or(1)
            .max(1)
    }

    fn mark_request_interrupted(
        &mut self,
        request: RequestLedgerRecord,
        now_ms: u64,
    ) -> Result<(), ControlPlaneError> {
        let diagnostic = SafeDiagnostic {
            code: "run_interrupted".to_string(),
            message: "Run was interrupted before this service instance started; retry requires an explicit new request.".to_string(),
            retryable: true,
        };

        let Some(snapshot) = self.sessions.get(&request.session_id).cloned() else {
            return self.repository.update_request_status(
                &request.client_request_id,
                RequestStatus::FailedRetryable,
                Some(now_ms),
                Some(diagnostic),
            );
        };

        let mut events = Vec::new();
        let graph = request.graph_id.as_ref().and_then(|graph_id| {
            snapshot
                .task_graphs
                .iter()
                .find(|graph| &graph.graph_id == graph_id)
                .cloned()
        });
        let graph = graph.map(|mut graph| {
            for unit in graph.work_units.iter_mut() {
                if !is_terminal_state(&unit.state) {
                    unit.state = OperationState::Failed;
                    events.push(self.record_event(
                        &request.session_id,
                        &request.objective_id,
                        request.plan_revision,
                        Some(graph.graph_id.clone()),
                        Some(unit.work_unit_id.clone()),
                        &request.run_id,
                        now_ms,
                        RuntimeEventPayload::WorkUnitLifecycle {
                            work_unit_id: unit.work_unit_id.clone(),
                            state: OperationState::Failed,
                            progress: 100,
                            message: diagnostic.message.clone(),
                        },
                    ));
                }
            }
            graph
        });

        events.push(self.record_event(
            &request.session_id,
            &request.objective_id,
            request.plan_revision,
            request.graph_id.clone(),
            None,
            &request.run_id,
            now_ms,
            RuntimeEventPayload::ExecutionCompleted {
                status: RuntimeTerminalStatus::Failed,
                summary: diagnostic.message.clone(),
            },
        ));

        self.save_snapshot_and_request_status(
            request.session_id.clone(),
            Some(request.objective_id.clone()),
            graph,
            request.plan_revision,
            Vec::new(),
            snapshot.pending_approvals,
            &events,
            Some(RequestStatusUpdate {
                client_request_id: &request.client_request_id,
                status: RequestStatus::FailedRetryable,
                terminal_at_ms: Some(now_ms),
                safe_diagnostic: Some(&diagnostic),
            }),
        )?;
        Ok(())
    }
}

pub fn empty_snapshot(session_id: SessionId, next_sequence: u64) -> ControlPlaneSessionSnapshot {
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

pub fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn is_terminal_state(state: &OperationState) -> bool {
    matches!(
        state,
        OperationState::Succeeded
            | OperationState::PartiallySucceeded
            | OperationState::Failed
            | OperationState::Cancelled
            | OperationState::Expired
    )
}

fn generated_id_suffix(id: &str) -> Option<u64> {
    id.rsplit_once('-')?.1.parse().ok()
}
