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
}

impl RuntimeJournal {
    pub fn new(
        mut repository: Box<dyn ControlPlaneRepository>,
        publisher: SharedEventPublisher,
    ) -> Result<Self, ControlPlaneError> {
        let _events = repository.load_events()?;
        let max_sequence = repository.max_event_sequence()?;
        let snapshots = repository.load_snapshots()?;
        let next_sequence = max_sequence.saturating_add(1);
        let mut sessions = BTreeMap::new();
        for snapshot in snapshots {
            sessions.insert(snapshot.session_id.clone(), snapshot);
        }
        let active_session_id = sessions.keys().next_back().cloned();

        Ok(Self {
            store: Arc::new(Mutex::new(RuntimeStore {
                repository,
                sessions,
                active_session_id,
                next_id: next_sequence.saturating_mul(10),
                next_sequence,
            })),
            publisher,
        })
    }

    pub fn set_publisher(&self, publisher: Arc<dyn RuntimeEventPublisher>) -> Result<(), ControlPlaneError> {
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
                store.repository.update_request_status(
                    &request.client_request_id,
                    RequestStatus::FailedRetryable,
                    Some(now_ms),
                    Some(SafeDiagnostic {
                        code: "run_interrupted".to_string(),
                        message: "Run was interrupted before this service instance started; retry requires an explicit new request.".to_string(),
                        retryable: true,
                    }),
                )?;
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
        event
    }

    pub fn active_snapshot(&self, requested_session_id: Option<SessionId>) -> ControlPlaneSessionSnapshot {
        let session_id = requested_session_id
            .or_else(|| self.active_session_id.clone())
            .unwrap_or_else(|| SessionId::new("session-uninitialized"));
        self.sessions
            .get(&session_id)
            .cloned()
            .unwrap_or_else(|| empty_snapshot(session_id, self.next_sequence))
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
        snapshot.next_sequence = self.next_sequence;
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
        snapshot.next_sequence = self.next_sequence;
        self.repository
            .save_events_snapshot_and_request_status(events, &snapshot, request_status)?;
        if !stale_revision {
            self.active_session_id = Some(snapshot.session_id.clone());
        }
        self.sessions.insert(snapshot.session_id.clone(), snapshot.clone());
        Ok(snapshot)
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
