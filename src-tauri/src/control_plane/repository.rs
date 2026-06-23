use super::contracts::{
    ControlPlaneError, ControlPlaneErrorKind, ControlPlaneSessionSnapshot, ObjectiveId,
    RequestLedgerRecord, RequestStatus, RuntimeEventEnvelope, SafeDiagnostic, SessionId,
    TaskGraphId, RunId, CONTROL_PLANE_PROTOCOL_VERSION,
};
use rusqlite::{params, Connection};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

pub trait ControlPlaneRepository: Send {
    fn append_event(&mut self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError>;
    fn save_snapshot(&mut self, snapshot: &ControlPlaneSessionSnapshot) -> Result<(), ControlPlaneError>;
    fn save_events_and_snapshot(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
    ) -> Result<(), ControlPlaneError>;
    fn save_events_snapshot_and_request(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request: Option<&RequestLedgerRecord>,
    ) -> Result<(), ControlPlaneError>;
    fn save_events_snapshot_and_request_status(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request_status: Option<RequestStatusUpdate<'_>>,
    ) -> Result<(), ControlPlaneError>;
    fn load_events(&mut self) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError>;
    fn max_event_sequence(&mut self) -> Result<u64, ControlPlaneError>;
    fn load_events_after(
        &mut self,
        session_id: &SessionId,
        after_sequence: u64,
        limit: usize,
    ) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError>;
    fn load_snapshots(&mut self) -> Result<Vec<ControlPlaneSessionSnapshot>, ControlPlaneError>;
    fn load_request(&mut self, client_request_id: &str)
        -> Result<Option<RequestLedgerRecord>, ControlPlaneError>;
    fn load_requests(&mut self) -> Result<Vec<RequestLedgerRecord>, ControlPlaneError>;
    fn update_request_status(
        &mut self,
        client_request_id: &str,
        status: RequestStatus,
        terminal_at_ms: Option<u64>,
        safe_diagnostic: Option<SafeDiagnostic>,
    ) -> Result<(), ControlPlaneError>;
}

#[derive(Clone)]
pub struct RequestStatusUpdate<'a> {
    pub client_request_id: &'a str,
    pub status: RequestStatus,
    pub terminal_at_ms: Option<u64>,
    pub safe_diagnostic: Option<&'a SafeDiagnostic>,
}

#[derive(Default)]
pub struct InMemoryControlPlaneRepository {
    events: Vec<RuntimeEventEnvelope>,
    snapshots: Vec<ControlPlaneSessionSnapshot>,
    requests: BTreeMap<String, RequestLedgerRecord>,
}

impl InMemoryControlPlaneRepository {
    pub fn new() -> Self {
        Self::default()
    }
}

impl ControlPlaneRepository for InMemoryControlPlaneRepository {
    fn append_event(&mut self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        if self
            .events
            .iter()
            .any(|existing| existing.event_id == event.event_id || (existing.session_id == event.session_id && existing.sequence == event.sequence))
        {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::DuplicateDispatch,
                "runtime event identity or sequence already exists",
            ));
        }
        self.events.push(event.clone());
        Ok(())
    }

    fn save_snapshot(&mut self, snapshot: &ControlPlaneSessionSnapshot) -> Result<(), ControlPlaneError> {
        self.snapshots
            .retain(|existing| existing.session_id != snapshot.session_id);
        self.snapshots.push(snapshot.clone());
        Ok(())
    }

    fn save_events_and_snapshot(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
    ) -> Result<(), ControlPlaneError> {
        self.save_events_snapshot_and_request(events, snapshot, None)
    }

    fn save_events_snapshot_and_request(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request: Option<&RequestLedgerRecord>,
    ) -> Result<(), ControlPlaneError> {
        let events_before = self.events.clone();
        let snapshots_before = self.snapshots.clone();
        let requests_before = self.requests.clone();

        for event in events {
            if let Err(error) = self.append_event(event) {
                self.events = events_before;
                self.snapshots = snapshots_before;
                self.requests = requests_before;
                return Err(error);
            }
        }

        if let Some(request) = request {
            if self.requests.contains_key(&request.client_request_id) {
                self.events = events_before;
                self.snapshots = snapshots_before;
                self.requests = requests_before;
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::DuplicateDispatch,
                    "client request already exists",
                ));
            }
            self.requests
                .insert(request.client_request_id.clone(), request.clone());
        }

        if let Err(error) = self.save_snapshot(snapshot) {
            self.events = events_before;
            self.snapshots = snapshots_before;
            self.requests = requests_before;
            return Err(error);
        }
        Ok(())
    }

    fn save_events_snapshot_and_request_status(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request_status: Option<RequestStatusUpdate<'_>>,
    ) -> Result<(), ControlPlaneError> {
        let events_before = self.events.clone();
        let snapshots_before = self.snapshots.clone();
        let requests_before = self.requests.clone();
        if let Err(error) = self.save_events_and_snapshot(events, snapshot) {
            self.events = events_before;
            self.snapshots = snapshots_before;
            self.requests = requests_before;
            return Err(error);
        }
        if let Some(update) = request_status {
            let Some(request) = self.requests.get_mut(update.client_request_id) else {
                self.events = events_before;
                self.snapshots = snapshots_before;
                self.requests = requests_before;
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::RecoveryRequiresVerification,
                    "request ledger record was not found for status update",
                ));
            };
            request.status = update.status;
            request.terminal_at_ms = update.terminal_at_ms;
            request.safe_diagnostic = update.safe_diagnostic.cloned();
        }
        Ok(())
    }

    fn load_events(&mut self) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        Ok(self.events.clone())
    }

    fn max_event_sequence(&mut self) -> Result<u64, ControlPlaneError> {
        Ok(self.events.iter().map(|event| event.sequence).max().unwrap_or(0))
    }

    fn load_events_after(
        &mut self,
        session_id: &SessionId,
        after_sequence: u64,
        limit: usize,
    ) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        Ok(self
            .events
            .iter()
            .filter(|event| &event.session_id == session_id && event.sequence > after_sequence)
            .take(limit.clamp(1, 500))
            .cloned()
            .collect())
    }

    fn load_snapshots(&mut self) -> Result<Vec<ControlPlaneSessionSnapshot>, ControlPlaneError> {
        Ok(self.snapshots.clone())
    }

    fn load_request(
        &mut self,
        client_request_id: &str,
    ) -> Result<Option<RequestLedgerRecord>, ControlPlaneError> {
        Ok(self.requests.get(client_request_id).cloned())
    }

    fn load_requests(&mut self) -> Result<Vec<RequestLedgerRecord>, ControlPlaneError> {
        Ok(self.requests.values().cloned().collect())
    }

    fn update_request_status(
        &mut self,
        client_request_id: &str,
        status: RequestStatus,
        terminal_at_ms: Option<u64>,
        safe_diagnostic: Option<SafeDiagnostic>,
    ) -> Result<(), ControlPlaneError> {
        let Some(request) = self.requests.get_mut(client_request_id) else {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::RecoveryRequiresVerification,
                "request ledger record was not found for status update",
            ));
        };
        request.status = status;
        request.terminal_at_ms = terminal_at_ms;
        request.safe_diagnostic = safe_diagnostic;
        Ok(())
    }
}

pub struct SqliteControlPlaneRepository {
    connection: Connection,
}

impl SqliteControlPlaneRepository {
    pub fn open(path: PathBuf) -> Result<Self, ControlPlaneError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| ControlPlaneError {
                kind: ControlPlaneErrorKind::Io,
                message: format!("could not create control-plane data directory {}", parent.display()),
                raw_diagnostic: Some(error.to_string()),
                retryable: true,
            })?;
        }

        let connection = Connection::open(&path)
            .map_err(sqlite_error("could not open control-plane SQLite repository"))?;
        let repository = Self { connection };
        repository.init()?;
        Ok(repository)
    }

    fn init(&self) -> Result<(), ControlPlaneError> {
        self.connection
            .execute_batch(
                "pragma journal_mode = wal;
                pragma foreign_keys = on;
                pragma busy_timeout = 3000;
                create table if not exists control_plane_schema (
                    schema_key text primary key not null,
                    schema_value text not null
                );
                insert into control_plane_schema (schema_key, schema_value)
                  values ('version', '2')
                  on conflict(schema_key) do update set schema_value=excluded.schema_value;
                create table if not exists runtime_events (
                    event_id text primary key not null,
                    sequence integer not null,
                    session_id text not null,
                    objective_id text not null,
                    occurred_at_ms integer not null,
                    payload_json text not null
                );
                create index if not exists runtime_events_sequence_idx on runtime_events(sequence);
                create unique index if not exists runtime_events_session_sequence_idx
                  on runtime_events(session_id, sequence);
                create table if not exists session_snapshots (
                    session_id text primary key not null,
                    plan_revision integer not null,
                    updated_sequence integer not null,
                    snapshot_json text not null
                );
                create table if not exists request_ledger (
                    client_request_id text primary key not null,
                    request_fingerprint text not null,
                    session_id text not null,
                    objective_id text not null,
                    run_id text not null,
                    graph_id text,
                    plan_revision integer not null,
                    status text not null,
                    accepted_at_ms integer not null,
                    terminal_at_ms integer,
                    safe_diagnostic_json text
                );
                create index if not exists request_ledger_run_idx on request_ledger(run_id);",
            )
            .map_err(sqlite_error("could not initialize control-plane SQLite schema"))
    }

    fn save_events_snapshot_request_internal(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request: Option<&RequestLedgerRecord>,
        request_status: Option<RequestStatusUpdate<'_>>,
    ) -> Result<(), ControlPlaneError> {
        let json = serde_json::to_string(snapshot)
            .map_err(json_error("could not serialize session snapshot"))?;
        let transaction = self
            .connection
            .transaction()
            .map_err(sqlite_error("could not start control-plane persistence transaction"))?;

        for event in events {
            let event_json = serde_json::to_string(event)
                .map_err(json_error("could not serialize runtime event"))?;
            transaction
                .execute(
                    "insert into runtime_events
                     (event_id, sequence, session_id, objective_id, occurred_at_ms, payload_json)
                     values (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        event.event_id.as_str(),
                        event.sequence as i64,
                        event.session_id.as_str(),
                        event.objective_id.as_str(),
                        event.occurred_at_ms as i64,
                        event_json,
                    ],
                )
                .map_err(sqlite_error("could not append runtime event"))?;
        }

        if let Some(request) = request {
            let diagnostic_json = request
                .safe_diagnostic
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(json_error("could not serialize request diagnostic"))?;
            transaction
                .execute(
                    "insert into request_ledger
                     (client_request_id, request_fingerprint, session_id, objective_id, run_id, graph_id,
                      plan_revision, status, accepted_at_ms, terminal_at_ms, safe_diagnostic_json)
                     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        request.client_request_id,
                        request.request_fingerprint,
                        request.session_id.as_str(),
                        request.objective_id.as_str(),
                        request.run_id.as_str(),
                        request.graph_id.as_ref().map(|graph_id| graph_id.as_str()),
                        request.plan_revision as i64,
                        request_status_key(&request.status),
                        request.accepted_at_ms as i64,
                        request.terminal_at_ms.map(|value| value as i64),
                        diagnostic_json,
                    ],
                )
                .map_err(sqlite_error("could not insert request ledger record"))?;
        }

        transaction
            .execute(
                "insert into session_snapshots
                 (session_id, plan_revision, updated_sequence, snapshot_json)
                 values (?1, ?2, ?3, ?4)
                 on conflict(session_id) do update set
                   plan_revision=excluded.plan_revision,
                   updated_sequence=excluded.updated_sequence,
                   snapshot_json=excluded.snapshot_json",
                params![
                    snapshot.session_id.as_str(),
                    snapshot.plan_revision as i64,
                    snapshot.next_sequence.saturating_sub(1) as i64,
                    json,
                ],
            )
            .map_err(sqlite_error("could not save session snapshot"))?;

        if let Some(update) = request_status {
            let diagnostic_json = update
                .safe_diagnostic
                .map(serde_json::to_string)
                .transpose()
                .map_err(json_error("could not serialize request diagnostic"))?;
            let updated = transaction
                .execute(
                    "update request_ledger
                     set status = ?2, terminal_at_ms = ?3, safe_diagnostic_json = ?4
                     where client_request_id = ?1",
                    params![
                        update.client_request_id,
                        request_status_key(&update.status),
                        update.terminal_at_ms.map(|value| value as i64),
                        diagnostic_json,
                    ],
                )
                .map_err(sqlite_error("could not update request ledger status"))?;
            if updated == 0 {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::RecoveryRequiresVerification,
                    "request ledger record was not found for status update",
                ));
            }
        }

        transaction
            .commit()
            .map_err(sqlite_error("could not commit control-plane persistence transaction"))?;
        Ok(())
    }
}

impl ControlPlaneRepository for SqliteControlPlaneRepository {
    fn append_event(&mut self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        let json = serde_json::to_string(event).map_err(json_error("could not serialize runtime event"))?;
        self.connection
            .execute(
                "insert into runtime_events
                 (event_id, sequence, session_id, objective_id, occurred_at_ms, payload_json)
                 values (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    event.event_id.as_str(),
                    event.sequence as i64,
                    event.session_id.as_str(),
                    event.objective_id.as_str(),
                    event.occurred_at_ms as i64,
                    json,
                ],
            )
            .map_err(sqlite_error("could not append runtime event"))?;
        Ok(())
    }

    fn save_snapshot(&mut self, snapshot: &ControlPlaneSessionSnapshot) -> Result<(), ControlPlaneError> {
        self.save_events_and_snapshot(&[], snapshot)
    }

    fn save_events_and_snapshot(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
    ) -> Result<(), ControlPlaneError> {
        self.save_events_snapshot_request_internal(events, snapshot, None, None)
    }

    fn save_events_snapshot_and_request(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request: Option<&RequestLedgerRecord>,
    ) -> Result<(), ControlPlaneError> {
        self.save_events_snapshot_request_internal(events, snapshot, request, None)
    }

    fn save_events_snapshot_and_request_status(
        &mut self,
        events: &[RuntimeEventEnvelope],
        snapshot: &ControlPlaneSessionSnapshot,
        request_status: Option<RequestStatusUpdate<'_>>,
    ) -> Result<(), ControlPlaneError> {
        self.save_events_snapshot_request_internal(events, snapshot, None, request_status)
    }

    fn load_events(&mut self) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        let mut statement = self
            .connection
            .prepare("select payload_json from runtime_events order by sequence asc")
            .map_err(sqlite_error("could not prepare runtime event replay"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(sqlite_error("could not query runtime event replay"))?;
        parse_event_rows(rows)
    }

    fn max_event_sequence(&mut self) -> Result<u64, ControlPlaneError> {
        self.connection
            .query_row("select coalesce(max(sequence), 0) from runtime_events", [], |row| {
                row.get::<_, i64>(0)
            })
            .map(|value| value as u64)
            .map_err(sqlite_error("could not read max runtime event sequence"))
    }

    fn load_events_after(
        &mut self,
        session_id: &SessionId,
        after_sequence: u64,
        limit: usize,
    ) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        let bounded_limit = limit.clamp(1, 500);
        let mut statement = self
            .connection
            .prepare(
                "select payload_json from runtime_events
                 where session_id = ?1 and sequence > ?2
                 order by sequence asc
                 limit ?3",
            )
            .map_err(sqlite_error("could not prepare runtime event catch-up"))?;
        let rows = statement
            .query_map(
                params![session_id.as_str(), after_sequence as i64, bounded_limit as i64],
                |row| row.get::<_, String>(0),
            )
            .map_err(sqlite_error("could not query runtime event catch-up"))?;
        parse_event_rows(rows)
    }

    fn load_snapshots(&mut self) -> Result<Vec<ControlPlaneSessionSnapshot>, ControlPlaneError> {
        let mut statement = self
            .connection
            .prepare("select snapshot_json from session_snapshots order by updated_sequence asc")
            .map_err(sqlite_error("could not prepare session snapshot replay"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(sqlite_error("could not query session snapshot replay"))?;
        let mut snapshots = Vec::new();
        for row in rows {
            let json = row.map_err(sqlite_error("could not read session snapshot row"))?;
            let Ok(snapshot) = serde_json::from_str::<ControlPlaneSessionSnapshot>(&json) else {
                continue;
            };
            if snapshot.protocol_version == CONTROL_PLANE_PROTOCOL_VERSION {
                snapshots.push(snapshot);
            }
        }
        Ok(snapshots)
    }

    fn load_request(
        &mut self,
        client_request_id: &str,
    ) -> Result<Option<RequestLedgerRecord>, ControlPlaneError> {
        let mut statement = self
            .connection
            .prepare(
                "select client_request_id, request_fingerprint, session_id, objective_id, run_id, graph_id,
                        plan_revision, status, accepted_at_ms, terminal_at_ms, safe_diagnostic_json
                 from request_ledger where client_request_id = ?1",
            )
            .map_err(sqlite_error("could not prepare request ledger lookup"))?;
        let result = statement.query_row(params![client_request_id], row_to_request);
        match result {
            Ok(request) => Ok(Some(request)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(sqlite_error("could not read request ledger record")(error)),
        }
    }

    fn load_requests(&mut self) -> Result<Vec<RequestLedgerRecord>, ControlPlaneError> {
        let mut statement = self
            .connection
            .prepare(
                "select client_request_id, request_fingerprint, session_id, objective_id, run_id, graph_id,
                        plan_revision, status, accepted_at_ms, terminal_at_ms, safe_diagnostic_json
                 from request_ledger order by accepted_at_ms asc",
            )
            .map_err(sqlite_error("could not prepare request ledger replay"))?;
        let rows = statement
            .query_map([], row_to_request)
            .map_err(sqlite_error("could not query request ledger replay"))?;
        let mut requests = Vec::new();
        for row in rows {
            requests.push(row.map_err(sqlite_error("could not read request ledger row"))?);
        }
        Ok(requests)
    }

    fn update_request_status(
        &mut self,
        client_request_id: &str,
        status: RequestStatus,
        terminal_at_ms: Option<u64>,
        safe_diagnostic: Option<SafeDiagnostic>,
    ) -> Result<(), ControlPlaneError> {
        let diagnostic_json = safe_diagnostic
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(json_error("could not serialize request diagnostic"))?;
        let updated = self.connection
            .execute(
                "update request_ledger
                 set status = ?2, terminal_at_ms = ?3, safe_diagnostic_json = ?4
                 where client_request_id = ?1",
                params![
                    client_request_id,
                    request_status_key(&status),
                    terminal_at_ms.map(|value| value as i64),
                    diagnostic_json,
                ],
            )
            .map_err(sqlite_error("could not update request ledger status"))?;
        if updated == 0 {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::RecoveryRequiresVerification,
                "request ledger record was not found for status update",
            ));
        }
        Ok(())
    }
}

fn parse_event_rows<F>(
    rows: rusqlite::MappedRows<'_, F>,
) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<String>,
{
    let mut events = Vec::new();
    for row in rows {
        let json = row.map_err(sqlite_error("could not read runtime event row"))?;
        let Ok(event) = serde_json::from_str::<RuntimeEventEnvelope>(&json) else {
            continue;
        };
        if event.protocol_version == CONTROL_PLANE_PROTOCOL_VERSION {
            events.push(event);
        }
    }
    Ok(events)
}

fn row_to_request(row: &rusqlite::Row<'_>) -> rusqlite::Result<RequestLedgerRecord> {
    let status: String = row.get(7)?;
    let diagnostic_json: Option<String> = row.get(10)?;
    let safe_diagnostic = diagnostic_json.and_then(|json| serde_json::from_str(&json).ok());
    Ok(RequestLedgerRecord {
        client_request_id: row.get(0)?,
        request_fingerprint: row.get(1)?,
        session_id: SessionId::new(row.get::<_, String>(2)?),
        objective_id: ObjectiveId::new(row.get::<_, String>(3)?),
        run_id: RunId::new(row.get::<_, String>(4)?),
        graph_id: row.get::<_, Option<String>>(5)?.map(TaskGraphId::new),
        plan_revision: row.get::<_, i64>(6)? as u64,
        status: parse_request_status(&status),
        accepted_at_ms: row.get::<_, i64>(8)? as u64,
        terminal_at_ms: row.get::<_, Option<i64>>(9)?.map(|value| value as u64),
        safe_diagnostic,
    })
}

fn request_status_key(status: &RequestStatus) -> &'static str {
    match status {
        RequestStatus::Accepted => "accepted",
        RequestStatus::Running => "running",
        RequestStatus::Completed => "completed",
        RequestStatus::FailedRetryable => "failed_retryable",
        RequestStatus::FailedTerminal => "failed_terminal",
        RequestStatus::Cancelled => "cancelled",
        RequestStatus::TimedOut => "timed_out",
    }
}

fn parse_request_status(value: &str) -> RequestStatus {
    match value {
        "running" => RequestStatus::Running,
        "completed" => RequestStatus::Completed,
        "failed_retryable" => RequestStatus::FailedRetryable,
        "failed_terminal" => RequestStatus::FailedTerminal,
        "cancelled" => RequestStatus::Cancelled,
        "timed_out" => RequestStatus::TimedOut,
        _ => RequestStatus::Accepted,
    }
}

fn sqlite_error(message: &'static str) -> impl FnOnce(rusqlite::Error) -> ControlPlaneError {
    move |error| ControlPlaneError {
        kind: ControlPlaneErrorKind::Io,
        message: message.to_string(),
        raw_diagnostic: Some(error.to_string()),
        retryable: true,
    }
}

fn json_error(message: &'static str) -> impl FnOnce(serde_json::Error) -> ControlPlaneError {
    move |error| ControlPlaneError {
        kind: ControlPlaneErrorKind::Io,
        message: message.to_string(),
        raw_diagnostic: Some(error.to_string()),
        retryable: false,
    }
}
