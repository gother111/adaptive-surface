use super::contracts::{
    ControlPlaneError, ControlPlaneErrorKind, ControlPlaneSessionSnapshot,
    RuntimeEventEnvelope, CONTROL_PLANE_PROTOCOL_VERSION,
};
use rusqlite::{params, Connection};
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
    fn load_events(&mut self) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError>;
    fn load_snapshots(&mut self) -> Result<Vec<ControlPlaneSessionSnapshot>, ControlPlaneError>;
}

#[derive(Default)]
pub struct InMemoryControlPlaneRepository {
    events: Vec<RuntimeEventEnvelope>,
    snapshots: Vec<ControlPlaneSessionSnapshot>,
}

impl InMemoryControlPlaneRepository {
    pub fn new() -> Self {
        Self::default()
    }
}

impl ControlPlaneRepository for InMemoryControlPlaneRepository {
    fn append_event(&mut self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
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
        for event in events {
            self.append_event(event)?;
        }
        self.save_snapshot(snapshot)
    }

    fn load_events(&mut self) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        Ok(self.events.clone())
    }

    fn load_snapshots(&mut self) -> Result<Vec<ControlPlaneSessionSnapshot>, ControlPlaneError> {
        Ok(self.snapshots.clone())
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

        let connection = Connection::open(&path).map_err(sqlite_error("could not open control-plane SQLite repository"))?;
        let repository = Self { connection };
        repository.init()?;
        Ok(repository)
    }

    fn init(&self) -> Result<(), ControlPlaneError> {
        self.connection
            .execute_batch(
                "create table if not exists runtime_events (
                    event_id text primary key not null,
                    sequence integer not null,
                    session_id text not null,
                    objective_id text not null,
                    occurred_at_ms integer not null,
                    payload_json text not null
                );
                create index if not exists runtime_events_sequence_idx on runtime_events(sequence);
                create table if not exists session_snapshots (
                    session_id text primary key not null,
                    plan_revision integer not null,
                    updated_sequence integer not null,
                    snapshot_json text not null
                );",
            )
            .map_err(sqlite_error("could not initialize control-plane SQLite schema"))
    }
}

impl ControlPlaneRepository for SqliteControlPlaneRepository {
    fn append_event(&mut self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        let json = serde_json::to_string(event).map_err(json_error("could not serialize runtime event"))?;
        self.connection
            .execute(
                "insert or ignore into runtime_events
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
        let json = serde_json::to_string(snapshot).map_err(json_error("could not serialize session snapshot"))?;
        let transaction = self
            .connection
            .transaction()
            .map_err(sqlite_error("could not start control-plane persistence transaction"))?;

        for event in events {
            let event_json = serde_json::to_string(event).map_err(json_error("could not serialize runtime event"))?;
            transaction
                .execute(
                    "insert or ignore into runtime_events
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
        transaction
            .commit()
            .map_err(sqlite_error("could not commit control-plane persistence transaction"))?;
        Ok(())
    }

    fn load_events(&mut self) -> Result<Vec<RuntimeEventEnvelope>, ControlPlaneError> {
        let mut statement = self
            .connection
            .prepare("select payload_json from runtime_events order by sequence asc")
            .map_err(sqlite_error("could not prepare runtime event replay"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(sqlite_error("could not query runtime event replay"))?;
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
