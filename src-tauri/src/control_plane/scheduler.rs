use super::authorization::authorize_for_dispatch;
use super::contracts::*;
use super::data_guard::redact_sensitive_diagnostic;
use super::executors::{ExecutorOutcome, ExecutorRegistry};
use super::journal::{epoch_ms, RuntimeJournal};
use super::repository::RequestStatusUpdate;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct SchedulerConfig {
    pub max_concurrency: usize,
    pub poll_interval_ms: u64,
    pub safety_config: SafetyConfig,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            max_concurrency: 2,
            poll_interval_ms: 20,
            safety_config: SafetyConfig::default(),
        }
    }
}

#[derive(Clone)]
pub struct TaskScheduler {
    journal: RuntimeJournal,
    registry: ExecutorRegistry,
    config: SchedulerConfig,
    controls: Arc<Mutex<BTreeMap<RunId, RunControl>>>,
}

#[derive(Clone)]
pub struct SchedulerRun {
    pub client_request_id: Option<String>,
    pub session_id: SessionId,
    pub objective_id: ObjectiveId,
    pub graph_id: TaskGraphId,
    pub run_id: RunId,
    pub plan_revision: u64,
    pub graph: TaskGraph,
}

#[derive(Clone)]
struct RunControl {
    run_cancel: Arc<AtomicBool>,
    unit_cancels: BTreeMap<WorkUnitId, Arc<AtomicBool>>,
}

struct RunningWorker {
    cancellation: Arc<AtomicBool>,
    deadline: Instant,
}

struct WorkerResult {
    work_unit_id: WorkUnitId,
    outcome: Result<ExecutorOutcome, ControlPlaneError>,
    finished_at_ms: u64,
}

impl TaskScheduler {
    pub fn new(journal: RuntimeJournal, registry: ExecutorRegistry, config: SchedulerConfig) -> Self {
        Self {
            journal,
            registry,
            config,
            controls: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    pub fn enqueue(&self, run: SchedulerRun) -> Result<(), ControlPlaneError> {
        self.validate_graph(&run.graph)?;
        let run_cancel = Arc::new(AtomicBool::new(false));
        let mut unit_cancels = BTreeMap::new();
        for unit in &run.graph.work_units {
            unit_cancels.insert(unit.work_unit_id.clone(), Arc::new(AtomicBool::new(false)));
        }
        let control = RunControl {
            run_cancel,
            unit_cancels,
        };
        self.controls
            .lock()
            .map_err(|_| ControlPlaneError::new(ControlPlaneErrorKind::Io, "scheduler controls lock was poisoned"))?
            .insert(run.run_id.clone(), control);

        let scheduler = self.clone();
        thread::spawn(move || scheduler.run_to_completion(run));
        Ok(())
    }

    pub fn cancel_operation(
        &self,
        command: OperationCommand,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let now_ms = command.now_ms.unwrap_or_else(epoch_ms);
        let (run_id, graph_id, objective_id) = {
            let snapshot = self.journal.get_session_snapshot(command.session_id.clone())?;
            if snapshot.plan_revision != command.plan_revision {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "operation command plan revision is stale",
                ));
            }
            let graph_id = snapshot.active_graph_id.clone().ok_or_else(|| {
                ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "no active graph is available")
            })?;
            let objective_id = snapshot.objective_id.clone().ok_or_else(|| {
                ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "no active objective is available")
            })?;
            let run_id = self.find_run_for_work_unit(&command.work_unit_id).ok_or_else(|| {
                ControlPlaneError::new(
                    ControlPlaneErrorKind::RecoveryRequiresVerification,
                    "run is not active in this process; recovery is required before cancellation can be trusted",
                )
            })?;
            (run_id, graph_id, objective_id)
        };

        let control = self
            .controls
            .lock()
            .map_err(|_| ControlPlaneError::new(ControlPlaneErrorKind::Io, "scheduler controls lock was poisoned"))?
            .get(&run_id)
            .cloned()
            .ok_or_else(|| {
                ControlPlaneError::new(
                    ControlPlaneErrorKind::RecoveryRequiresVerification,
                    "run control is not available for cancellation",
                )
            })?;

        let snapshot = self.commit_lifecycle(
            &command.session_id,
            &objective_id,
            &graph_id,
            &run_id,
            command.plan_revision,
            &command.work_unit_id,
            OperationState::Cancelled,
            100,
            "Operation cancelled by request.",
            now_ms,
        )?;
        control.run_cancel.store(true, Ordering::SeqCst);
        for cancel in control.unit_cancels.values() {
            cancel.store(true, Ordering::SeqCst);
        }
        Ok(snapshot)
    }

    pub fn validate_graph(&self, graph: &TaskGraph) -> Result<(), ControlPlaneError> {
        if graph.work_units.is_empty() {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "task graph must contain at least one work unit",
            ));
        }

        let mut ids = BTreeSet::new();
        for unit in &graph.work_units {
            if !ids.insert(unit.work_unit_id.clone()) {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "task graph contains a duplicate work-unit id",
                ));
            }
            if unit.state != OperationState::Planned {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "task graph work units must start in planned state",
                ));
            }
            if !self.registry.contains(&unit.capability_id) {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::CapabilityUnavailable,
                    format!("capability {} is not registered", unit.capability_id),
                ));
            }
            if unit.execution_policy.timeout_ms == 0 {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "work-unit timeout must be greater than zero",
                ));
            }
            if unit.execution_policy.retry_policy.max_attempts != 1 {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "scheduler retry execution is not implemented; maxAttempts must be 1",
                ));
            }
            for dependency in &unit.dependencies {
                if dependency.upstream_work_unit_id == unit.work_unit_id {
                    return Err(ControlPlaneError::new(
                        ControlPlaneErrorKind::InvalidTransition,
                        "task graph contains a self-dependency",
                    ));
                }
            }
        }
        for unit in &graph.work_units {
            for dependency in &unit.dependencies {
                if !ids.contains(&dependency.upstream_work_unit_id) {
                    return Err(ControlPlaneError::new(
                        ControlPlaneErrorKind::InvalidTransition,
                        "task graph references a missing dependency",
                    ));
                }
            }
        }
        if contains_cycle(graph) {
            return Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "task graph contains a cycle",
            ));
        }
        Ok(())
    }

    fn run_to_completion(&self, run: SchedulerRun) {
        if self.journal.update_request_status(
            run.client_request_id.as_deref(),
            RequestStatus::Running,
            None,
            None,
        ).is_err() {
            return;
        }

        let mut graph = run.graph.clone();
        let mut outcomes: BTreeMap<WorkUnitId, ExecutorOutcome> = BTreeMap::new();
        let mut running: BTreeMap<WorkUnitId, RunningWorker> = BTreeMap::new();
        let (sender, receiver) = mpsc::channel::<WorkerResult>();

        loop {
            if self
                .control_for(&run.run_id)
                .map(|control| control.run_cancel.load(Ordering::SeqCst))
                .unwrap_or(false)
            {
                self.cancel_remaining_units(&run, &mut graph, &mut running);
            }

            self.expire_overdue_workers(&run, &mut graph, &mut running);

            let ready_units = ready_units(&graph, &running);
            for work_unit_id in ready_units {
                if running.len() >= self.config.max_concurrency.max(1) {
                    break;
                }
                let Some(unit) = graph
                    .work_units
                    .iter()
                    .find(|unit| unit.work_unit_id == work_unit_id)
                    .cloned()
                else {
                    continue;
                };
                if self
                    .start_unit(&run, &mut graph, unit, &outcomes, &sender, &mut running)
                    .is_err()
                {
                    break;
                }
            }

            if graph.work_units.iter().all(|unit| is_terminal(&unit.state)) {
                let status = aggregate_status(&graph);
                let summary = match status {
                    RuntimeTerminalStatus::Succeeded => "Run completed through the Rust scheduler.",
                    RuntimeTerminalStatus::Cancelled => "Run was cancelled.",
                    RuntimeTerminalStatus::TimedOut => "Run timed out.",
                    RuntimeTerminalStatus::Failed => "Run stopped after a work-unit failure.",
                    RuntimeTerminalStatus::LegacyFallback => "Run was delegated to legacy fallback.",
                };
                let now_ms = epoch_ms();
                let request_status = match status {
                    RuntimeTerminalStatus::Succeeded => RequestStatus::Completed,
                    RuntimeTerminalStatus::Cancelled => RequestStatus::Cancelled,
                    RuntimeTerminalStatus::TimedOut => RequestStatus::TimedOut,
                    RuntimeTerminalStatus::Failed | RuntimeTerminalStatus::LegacyFallback => {
                        RequestStatus::FailedTerminal
                    }
                };
                if self.commit_run_terminal(
                    &run,
                    status.clone(),
                    request_status,
                    summary,
                    now_ms,
                ).is_err() {
                    break;
                }
                let _ = self
                    .controls
                    .lock()
                    .map(|mut controls| controls.remove(&run.run_id));
                break;
            }

            if running.is_empty() {
                self.block_unreachable_units(&run, &mut graph);
                continue;
            }

            match receiver.recv_timeout(Duration::from_millis(self.config.poll_interval_ms.max(1))) {
                Ok(result) => self.apply_worker_result(&run, &mut graph, result, &mut running, &mut outcomes),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    self.block_unreachable_units(&run, &mut graph);
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn start_unit(
        &self,
        run: &SchedulerRun,
        graph: &mut TaskGraph,
        unit: WorkUnit,
        outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
        sender: &mpsc::Sender<WorkerResult>,
        running: &mut BTreeMap<WorkUnitId, RunningWorker>,
    ) -> Result<(), ControlPlaneError> {
        let now_ms = epoch_ms();
        let ready_snapshot = self.commit_lifecycle(
            &run.session_id,
            &run.objective_id,
            &run.graph_id,
            &run.run_id,
            run.plan_revision,
            &unit.work_unit_id,
            OperationState::Ready,
            0,
            "Work unit became dependency-ready.",
            now_ms,
        )?;
        if !snapshot_has_unit_state(&ready_snapshot, &run.graph_id, &unit.work_unit_id, &OperationState::Ready) {
            return Ok(());
        }
        set_local_state(graph, &unit.work_unit_id, OperationState::Ready);

        let token = self
            .control_for(&run.run_id)
            .and_then(|control| control.unit_cancels.get(&unit.work_unit_id).cloned())
            .unwrap_or_else(|| Arc::new(AtomicBool::new(false)));
        if self
            .control_for(&run.run_id)
            .map(|control| control.run_cancel.load(Ordering::SeqCst))
            .unwrap_or(false)
        {
            token.store(true, Ordering::SeqCst);
        }

        if token.load(Ordering::SeqCst) {
            let cancelled_snapshot = self.commit_lifecycle(
                &run.session_id,
                &run.objective_id,
                &run.graph_id,
                &run.run_id,
                run.plan_revision,
                &unit.work_unit_id,
                OperationState::Cancelled,
                100,
                "Work unit cancelled before dispatch.",
                now_ms,
            )?;
            if snapshot_has_unit_state(&cancelled_snapshot, &run.graph_id, &unit.work_unit_id, &OperationState::Cancelled) {
                set_local_state(graph, &unit.work_unit_id, OperationState::Cancelled);
            }
            return Ok(());
        }

        let descriptor = self.registry.capability_descriptor(&unit.capability_id);
        let authorized = match authorize_for_dispatch(
            &self.config.safety_config,
            graph,
            unit.clone(),
            descriptor.as_ref(),
        ) {
            Ok(authorized) => authorized,
            Err(error) => {
                let failed_snapshot = self.commit_lifecycle(
                    &run.session_id,
                    &run.objective_id,
                    &run.graph_id,
                    &run.run_id,
                    run.plan_revision,
                    &unit.work_unit_id,
                    OperationState::Failed,
                    100,
                    &error.message,
                    now_ms,
                )?;
                if snapshot_has_unit_state(
                    &failed_snapshot,
                    &run.graph_id,
                    &unit.work_unit_id,
                    &OperationState::Failed,
                ) {
                    set_local_state(graph, &unit.work_unit_id, OperationState::Failed);
                }
                return Ok(());
            }
        };

        let running_snapshot = self.commit_lifecycle(
            &run.session_id,
            &run.objective_id,
            &run.graph_id,
            &run.run_id,
            run.plan_revision,
            &unit.work_unit_id,
            OperationState::Running,
            50,
            "Work unit dispatched through a typed capability executor.",
            now_ms,
        )?;
        if !snapshot_has_unit_state(&running_snapshot, &run.graph_id, &unit.work_unit_id, &OperationState::Running) {
            return Ok(());
        }
        set_local_state(graph, &unit.work_unit_id, OperationState::Running);

        let deadline = Instant::now() + Duration::from_millis(unit.execution_policy.timeout_ms);
        let executor = self.registry.get(&unit.capability_id).ok_or_else(|| {
            ControlPlaneError::new(
                ControlPlaneErrorKind::CapabilityUnavailable,
                format!("capability {} is not registered", unit.capability_id),
            )
        })?;
        let context = super::executors::ExecutionContext {
            run_id: run.run_id.clone(),
            graph_id: run.graph_id.clone(),
            work_unit_id: unit.work_unit_id.clone(),
            plan_revision: run.plan_revision,
            cancellation: Arc::clone(&token),
            deadline,
            now_ms,
        };
        let prior_outcomes = outcomes.clone();
        let sender = sender.clone();
        let work_unit_id = unit.work_unit_id.clone();
        let running_work_unit_id = unit.work_unit_id.clone();
        thread::spawn(move || {
            let outcome = executor.execute(&authorized, &context, &prior_outcomes);
            let _ = sender.send(WorkerResult {
                work_unit_id,
                outcome,
                finished_at_ms: epoch_ms(),
            });
        });

        running.insert(
            running_work_unit_id,
            RunningWorker {
                cancellation: token,
                deadline,
            },
        );
        Ok(())
    }

    fn apply_worker_result(
        &self,
        run: &SchedulerRun,
        graph: &mut TaskGraph,
        result: WorkerResult,
        running: &mut BTreeMap<WorkUnitId, RunningWorker>,
        outcomes: &mut BTreeMap<WorkUnitId, ExecutorOutcome>,
    ) {
        let Some(worker) = running.remove(&result.work_unit_id) else {
            return;
        };
        let current_state = graph
            .work_units
            .iter()
            .find(|unit| unit.work_unit_id == result.work_unit_id)
            .map(|unit| unit.state.clone());
        if current_state.as_ref().is_some_and(is_terminal) || worker.cancellation.load(Ordering::SeqCst) {
            return;
        }

        match result.outcome {
            Ok(outcome) => {
                if let ExecutorOutcome::Artifact(artifact) = &outcome {
                    if self
                        .commit_artifact(run, &result.work_unit_id, artifact.clone(), result.finished_at_ms)
                        .is_err()
                    {
                        set_local_state(graph, &result.work_unit_id, OperationState::Failed);
                        return;
                    }
                }
                let succeeded = self.commit_lifecycle(
                    &run.session_id,
                    &run.objective_id,
                    &run.graph_id,
                    &run.run_id,
                    run.plan_revision,
                    &result.work_unit_id,
                    OperationState::Succeeded,
                    100,
                    "Work unit completed successfully.",
                    result.finished_at_ms,
                );
                if let Ok(snapshot) = succeeded {
                    if snapshot_has_unit_state(&snapshot, &run.graph_id, &result.work_unit_id, &OperationState::Succeeded) {
                        outcomes.insert(result.work_unit_id.clone(), outcome);
                        set_local_state(graph, &result.work_unit_id, OperationState::Succeeded);
                    }
                } else {
                    set_local_state(graph, &result.work_unit_id, OperationState::Failed);
                }
            }
            Err(error) => {
                let failed = self.commit_lifecycle(
                    &run.session_id,
                    &run.objective_id,
                    &run.graph_id,
                    &run.run_id,
                    run.plan_revision,
                    &result.work_unit_id,
                    OperationState::Failed,
                    100,
                    &error.message,
                    result.finished_at_ms,
                );
                if let Ok(snapshot) = failed {
                    if snapshot_has_unit_state(&snapshot, &run.graph_id, &result.work_unit_id, &OperationState::Failed) {
                        set_local_state(graph, &result.work_unit_id, OperationState::Failed);
                    }
                } else {
                    set_local_state(graph, &result.work_unit_id, OperationState::Failed);
                }
            }
        }
    }

    fn expire_overdue_workers(
        &self,
        run: &SchedulerRun,
        graph: &mut TaskGraph,
        running: &mut BTreeMap<WorkUnitId, RunningWorker>,
    ) {
        let now = Instant::now();
        let expired = running
            .iter()
            .filter_map(|(work_unit_id, worker)| {
                (now >= worker.deadline).then_some((work_unit_id.clone(), Arc::clone(&worker.cancellation)))
            })
            .collect::<Vec<_>>();
        for (work_unit_id, cancellation) in expired {
            cancellation.store(true, Ordering::SeqCst);
            running.remove(&work_unit_id);
            let now_ms = epoch_ms();
            if let Ok(snapshot) = self.commit_lifecycle(
                &run.session_id,
                &run.objective_id,
                &run.graph_id,
                &run.run_id,
                run.plan_revision,
                &work_unit_id,
                OperationState::Expired,
                100,
                "Work unit deadline expired; any late result will be discarded.",
                now_ms,
            ) {
                if snapshot_has_unit_state(&snapshot, &run.graph_id, &work_unit_id, &OperationState::Expired) {
                    set_local_state(graph, &work_unit_id, OperationState::Expired);
                }
            }
        }
    }

    fn block_unreachable_units(&self, run: &SchedulerRun, graph: &mut TaskGraph) {
        let blocked = graph
            .work_units
            .iter()
            .filter(|unit| !is_terminal(&unit.state) && has_failed_required_dependency(unit, graph))
            .map(|unit| unit.work_unit_id.clone())
            .collect::<Vec<_>>();
        for work_unit_id in blocked {
            let now_ms = epoch_ms();
            if let Ok(snapshot) = self.commit_lifecycle(
                &run.session_id,
                &run.objective_id,
                &run.graph_id,
                &run.run_id,
                run.plan_revision,
                &work_unit_id,
                OperationState::Failed,
                100,
                "Work unit skipped because a required dependency did not succeed.",
                now_ms,
            ) {
                if snapshot_has_unit_state(&snapshot, &run.graph_id, &work_unit_id, &OperationState::Failed) {
                    set_local_state(graph, &work_unit_id, OperationState::Failed);
                }
            }
        }
    }

    fn cancel_remaining_units(
        &self,
        run: &SchedulerRun,
        graph: &mut TaskGraph,
        running: &mut BTreeMap<WorkUnitId, RunningWorker>,
    ) {
        for worker in running.values() {
            worker.cancellation.store(true, Ordering::SeqCst);
        }
        let cancellable = graph
            .work_units
            .iter()
            .filter(|unit| !is_terminal(&unit.state))
            .map(|unit| unit.work_unit_id.clone())
            .collect::<Vec<_>>();
        for work_unit_id in cancellable {
            let now_ms = epoch_ms();
            if let Ok(snapshot) = self.commit_lifecycle(
                &run.session_id,
                &run.objective_id,
                &run.graph_id,
                &run.run_id,
                run.plan_revision,
                &work_unit_id,
                OperationState::Cancelled,
                100,
                "Work unit cancelled by run cancellation.",
                now_ms,
            ) {
                if snapshot_has_unit_state(&snapshot, &run.graph_id, &work_unit_id, &OperationState::Cancelled) {
                    set_local_state(graph, &work_unit_id, OperationState::Cancelled);
                    running.remove(&work_unit_id);
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn commit_lifecycle(
        &self,
        session_id: &SessionId,
        objective_id: &ObjectiveId,
        graph_id: &TaskGraphId,
        run_id: &RunId,
        plan_revision: u64,
        work_unit_id: &WorkUnitId,
        state: OperationState,
        progress: u8,
        message: &str,
        now_ms: u64,
    ) -> Result<ControlPlaneSessionSnapshot, ControlPlaneError> {
        let (event, snapshot) = {
            let mut store = self.journal.lock_store()?;
            let mut snapshot = store.sessions.get(session_id).cloned().ok_or_else(|| {
                ControlPlaneError::new(ControlPlaneErrorKind::RecoveryRequiresVerification, "session was not found")
            })?;
            let mut graph = snapshot
                .task_graphs
                .iter()
                .find(|graph| &graph.graph_id == graph_id)
                .cloned()
                .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "graph was not found"))?;
            if let Some(unit) = graph
                .work_units
                .iter()
                .find(|unit| &unit.work_unit_id == work_unit_id)
            {
                if is_terminal(&unit.state) {
                    return Ok(snapshot);
                }
            }
            if let Some(unit) = graph
                .work_units
                .iter_mut()
                .find(|unit| &unit.work_unit_id == work_unit_id)
            {
                unit.state = state.clone();
            }
            let event = store.record_event(
                session_id,
                objective_id,
                plan_revision,
                Some(graph_id.clone()),
                Some(work_unit_id.clone()),
                run_id,
                now_ms,
                RuntimeEventPayload::WorkUnitLifecycle {
                    work_unit_id: work_unit_id.clone(),
                    state,
                    progress,
                    message: redact_sensitive_diagnostic(message),
                },
            );
            snapshot = store.save_snapshot(
                session_id.clone(),
                Some(objective_id.clone()),
                Some(graph),
                plan_revision,
                Vec::new(),
                snapshot.pending_approvals,
                std::slice::from_ref(&event),
                None,
            )?;
            (event, snapshot)
        };
        self.journal.publish_events(std::slice::from_ref(&event));
        Ok(snapshot)
    }

    fn commit_artifact(
        &self,
        run: &SchedulerRun,
        work_unit_id: &WorkUnitId,
        artifact: ArtifactEnvelope,
        now_ms: u64,
    ) -> Result<(), ControlPlaneError> {
        let event = {
            let mut store = self.journal.lock_store()?;
            let snapshot = store.sessions.get(&run.session_id).cloned().ok_or_else(|| {
                ControlPlaneError::new(ControlPlaneErrorKind::RecoveryRequiresVerification, "session was not found")
            })?;
            let graph = snapshot
                .task_graphs
                .iter()
                .find(|graph| graph.graph_id == run.graph_id)
                .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "graph was not found"))?;
            let unit = graph
                .work_units
                .iter()
                .find(|unit| &unit.work_unit_id == work_unit_id)
                .ok_or_else(|| ControlPlaneError::new(ControlPlaneErrorKind::InvalidTransition, "work unit was not found"))?;
            if is_terminal(&unit.state) || unit.state != OperationState::Running {
                return Err(ControlPlaneError::new(
                    ControlPlaneErrorKind::InvalidTransition,
                    "artifact result arrived after the work unit was no longer running",
                ));
            }
            let event = store.record_event(
                &run.session_id,
                &run.objective_id,
                run.plan_revision,
                Some(run.graph_id.clone()),
                Some(work_unit_id.clone()),
                &run.run_id,
                now_ms,
                RuntimeEventPayload::ArtifactAdded {
                    artifact: artifact.clone(),
                },
            );
            let pending_approvals = store
                .sessions
                .get(&run.session_id)
                .map(|snapshot| snapshot.pending_approvals.clone())
                .unwrap_or_default();
            store.save_snapshot(
                run.session_id.clone(),
                Some(run.objective_id.clone()),
                None,
                run.plan_revision,
                vec![artifact],
                pending_approvals,
                std::slice::from_ref(&event),
                None,
            )?;
            event
        };
        self.journal.publish_events(std::slice::from_ref(&event));
        Ok(())
    }

    fn commit_run_terminal(
        &self,
        run: &SchedulerRun,
        status: RuntimeTerminalStatus,
        request_status: RequestStatus,
        summary: &str,
        now_ms: u64,
    ) -> Result<(), ControlPlaneError> {
        let event = {
            let mut store = self.journal.lock_store()?;
            let event = store.record_event(
                &run.session_id,
                &run.objective_id,
                run.plan_revision,
                Some(run.graph_id.clone()),
                None,
                &run.run_id,
                now_ms,
                RuntimeEventPayload::ExecutionCompleted {
                    status,
                    summary: summary.to_string(),
                },
            );
            let pending_approvals = store
                .sessions
                .get(&run.session_id)
                .map(|snapshot| snapshot.pending_approvals.clone())
                .unwrap_or_default();
            store.save_snapshot_and_request_status(
                run.session_id.clone(),
                Some(run.objective_id.clone()),
                None,
                run.plan_revision,
                Vec::new(),
                pending_approvals,
                std::slice::from_ref(&event),
                run.client_request_id.as_deref().map(|client_request_id| RequestStatusUpdate {
                    client_request_id,
                    status: request_status,
                    terminal_at_ms: Some(now_ms),
                    safe_diagnostic: None,
                }),
            )?;
            event
        };
        self.journal.publish_events(std::slice::from_ref(&event));
        Ok(())
    }

    fn find_run_for_work_unit(&self, work_unit_id: &WorkUnitId) -> Option<RunId> {
        self.controls
            .lock()
            .ok()
            .and_then(|controls| {
                controls
                    .iter()
                    .find(|(_, control)| control.unit_cancels.contains_key(work_unit_id))
                    .map(|(run_id, _)| run_id.clone())
            })
    }

    fn control_for(&self, run_id: &RunId) -> Option<RunControl> {
        self.controls
            .lock()
            .ok()
            .and_then(|controls| controls.get(run_id).cloned())
    }
}

fn ready_units(graph: &TaskGraph, running: &BTreeMap<WorkUnitId, RunningWorker>) -> Vec<WorkUnitId> {
    graph
        .work_units
        .iter()
        .filter(|unit| {
            matches!(unit.state, OperationState::Planned | OperationState::Ready)
                && !running.contains_key(&unit.work_unit_id)
                && dependencies_satisfied(unit, graph)
        })
        .map(|unit| unit.work_unit_id.clone())
        .collect()
}

fn dependencies_satisfied(unit: &WorkUnit, graph: &TaskGraph) -> bool {
    if unit.dependencies.is_empty() {
        return true;
    }
    match unit.join_policy {
        JoinPolicy::AllSucceeded => unit.dependencies.iter().all(|dependency| {
            graph
                .work_units
                .iter()
                .find(|candidate| candidate.work_unit_id == dependency.upstream_work_unit_id)
                .is_some_and(|upstream| match dependency.dependency_kind {
                    DependencyKind::RequiresSuccess => {
                        matches!(upstream.state, OperationState::Succeeded | OperationState::PartiallySucceeded)
                    }
                    DependencyKind::RequiresTerminal => is_terminal(&upstream.state),
                })
        }),
        JoinPolicy::AnyTerminal => unit.dependencies.iter().any(|dependency| {
            graph
                .work_units
                .iter()
                .find(|candidate| candidate.work_unit_id == dependency.upstream_work_unit_id)
                .is_some_and(|upstream| is_terminal(&upstream.state))
        }),
        JoinPolicy::BestEffort => unit.dependencies.iter().all(|dependency| {
            graph
                .work_units
                .iter()
                .find(|candidate| candidate.work_unit_id == dependency.upstream_work_unit_id)
                .is_some_and(|upstream| is_terminal(&upstream.state))
        }),
    }
}

fn has_failed_required_dependency(unit: &WorkUnit, graph: &TaskGraph) -> bool {
    unit.dependencies.iter().any(|dependency| {
        dependency.dependency_kind == DependencyKind::RequiresSuccess
            && graph
                .work_units
                .iter()
                .find(|candidate| candidate.work_unit_id == dependency.upstream_work_unit_id)
                .is_some_and(|upstream| {
                    matches!(
                        upstream.state,
                        OperationState::Failed | OperationState::Cancelled | OperationState::Expired
                    )
                })
    })
}

fn aggregate_status(graph: &TaskGraph) -> RuntimeTerminalStatus {
    if graph
        .work_units
        .iter()
        .any(|unit| matches!(unit.state, OperationState::Cancelled))
    {
        RuntimeTerminalStatus::Cancelled
    } else if graph
        .work_units
        .iter()
        .any(|unit| matches!(unit.state, OperationState::Expired))
    {
        RuntimeTerminalStatus::TimedOut
    } else if graph
        .work_units
        .iter()
        .any(|unit| matches!(unit.state, OperationState::Failed))
    {
        RuntimeTerminalStatus::Failed
    } else {
        RuntimeTerminalStatus::Succeeded
    }
}

fn set_local_state(graph: &mut TaskGraph, work_unit_id: &WorkUnitId, state: OperationState) {
    if let Some(unit) = graph
        .work_units
        .iter_mut()
        .find(|unit| &unit.work_unit_id == work_unit_id)
    {
        unit.state = state;
    }
}

fn snapshot_has_unit_state(
    snapshot: &ControlPlaneSessionSnapshot,
    graph_id: &TaskGraphId,
    work_unit_id: &WorkUnitId,
    state: &OperationState,
) -> bool {
    snapshot
        .task_graphs
        .iter()
        .find(|graph| &graph.graph_id == graph_id)
        .and_then(|graph| {
            graph
                .work_units
                .iter()
                .find(|unit| &unit.work_unit_id == work_unit_id)
        })
        .is_some_and(|unit| &unit.state == state)
}

pub fn is_terminal(state: &OperationState) -> bool {
    matches!(
        state,
        OperationState::Succeeded
            | OperationState::PartiallySucceeded
            | OperationState::Failed
            | OperationState::Cancelled
            | OperationState::Expired
    )
}

fn contains_cycle(graph: &TaskGraph) -> bool {
    let mut visiting = BTreeSet::new();
    let mut visited = BTreeSet::new();
    for unit in &graph.work_units {
        if visit_cycle(unit.work_unit_id.clone(), graph, &mut visiting, &mut visited) {
            return true;
        }
    }
    false
}

fn visit_cycle(
    work_unit_id: WorkUnitId,
    graph: &TaskGraph,
    visiting: &mut BTreeSet<WorkUnitId>,
    visited: &mut BTreeSet<WorkUnitId>,
) -> bool {
    if visited.contains(&work_unit_id) {
        return false;
    }
    if !visiting.insert(work_unit_id.clone()) {
        return true;
    }
    if let Some(unit) = graph
        .work_units
        .iter()
        .find(|unit| unit.work_unit_id == work_unit_id)
    {
        for dependency in &unit.dependencies {
            if visit_cycle(
                dependency.upstream_work_unit_id.clone(),
                graph,
                visiting,
                visited,
            ) {
                return true;
            }
        }
    }
    visiting.remove(&work_unit_id);
    visited.insert(work_unit_id);
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control_plane::authorization::AuthorizedOperation;
    use crate::control_plane::executors::{
        CapabilityExecutor, ExecutionContext, ExecutorOutcome, ExecutorRegistry,
    };
    use crate::control_plane::journal::RuntimeJournal;
    use crate::control_plane::publisher::{CollectingEventPublisher, SharedEventPublisher};
    use crate::control_plane::repository::InMemoryControlPlaneRepository;
    use std::sync::{Condvar, Mutex as StdMutex};

    #[derive(Default)]
    struct Harness {
        active: std::sync::atomic::AtomicUsize,
        max_active: std::sync::atomic::AtomicUsize,
        started: (StdMutex<Vec<String>>, Condvar),
        release: (StdMutex<bool>, Condvar),
    }

    impl Harness {
        fn record_start(&self, id: &str) {
            let active = self.active.fetch_add(1, Ordering::SeqCst).saturating_add(1);
            loop {
                let current = self.max_active.load(Ordering::SeqCst);
                if active <= current
                    || self
                        .max_active
                        .compare_exchange(current, active, Ordering::SeqCst, Ordering::SeqCst)
                        .is_ok()
                {
                    break;
                }
            }
            let (lock, cvar) = &self.started;
            let mut started = lock.lock().expect("started lock should work");
            started.push(id.to_string());
            cvar.notify_all();
        }

        fn wait_for_started_count(&self, count: usize) {
            let (lock, cvar) = &self.started;
            let mut started = lock.lock().expect("started lock should work");
            let deadline = Instant::now() + Duration::from_secs(2);
            while started.len() < count {
                let now = Instant::now();
                assert!(now < deadline, "executor did not reach expected start count");
                let timeout = deadline.saturating_duration_since(now);
                let result = cvar
                    .wait_timeout(started, timeout)
                    .expect("started cvar should work");
                started = result.0;
            }
        }

        fn release_all(&self) {
            let (lock, cvar) = &self.release;
            let mut released = lock.lock().expect("release lock should work");
            *released = true;
            cvar.notify_all();
        }

        fn wait_release(&self) {
            let (lock, cvar) = &self.release;
            let mut released = lock.lock().expect("release lock should work");
            while !*released {
                released = cvar.wait(released).expect("release cvar should work");
            }
            self.active.fetch_sub(1, Ordering::SeqCst);
        }

        fn start_order(&self) -> Vec<String> {
            self.started
                .0
                .lock()
                .expect("started lock should work")
                .clone()
        }
    }

    struct BlockingExecutor {
        harness: Arc<Harness>,
    }

    impl CapabilityExecutor for BlockingExecutor {
        fn capability_id(&self) -> &'static str {
            "test.block"
        }

        fn execute(
            &self,
            operation: &AuthorizedOperation,
            _context: &ExecutionContext,
            _prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
        ) -> Result<ExecutorOutcome, ControlPlaneError> {
            let unit = operation.unit();
            self.harness.record_start(unit.work_unit_id.as_str());
            self.harness.wait_release();
            Ok(ExecutorOutcome::TriageSummary(crate::control_plane::executors::TriageSummary {
                mode: crate::control_plane::executors::EmailTriageMode::CatchUp,
                message_count: 0,
                unread_count: 0,
            }))
        }
    }

    struct NeverCompletingExecutor;

    impl CapabilityExecutor for NeverCompletingExecutor {
        fn capability_id(&self) -> &'static str {
            "test.never"
        }

        fn execute(
            &self,
            _operation: &AuthorizedOperation,
            context: &ExecutionContext,
            _prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
        ) -> Result<ExecutorOutcome, ControlPlaneError> {
            while !context.is_cancelled() {
                thread::sleep(Duration::from_millis(1));
            }
            Err(ControlPlaneError::new(
                ControlPlaneErrorKind::InvalidTransition,
                "test executor observed cancellation",
            ))
        }
    }

    struct SecretFailingExecutor;

    impl CapabilityExecutor for SecretFailingExecutor {
        fn capability_id(&self) -> &'static str {
            "test.secret"
        }

        fn execute(
            &self,
            _operation: &AuthorizedOperation,
            _context: &ExecutionContext,
            _prior_outcomes: &BTreeMap<WorkUnitId, ExecutorOutcome>,
        ) -> Result<ExecutorOutcome, ControlPlaneError> {
            Err(ControlPlaneError::new(
                ControlPlaneErrorKind::ExecutorFailed,
                "provider returned token sk-proj-secret-value",
            ))
        }
    }

    fn scheduler_with_executor(executor: Arc<dyn CapabilityExecutor>) -> (RuntimeJournal, TaskScheduler) {
        let publisher = SharedEventPublisher::noop();
        publisher
            .replace(Arc::new(CollectingEventPublisher::default()))
            .expect("publisher should install");
        let journal = RuntimeJournal::new(
            Box::new(InMemoryControlPlaneRepository::new()),
            publisher,
        )
        .expect("journal should initialize");
        let scheduler = TaskScheduler::new(
            journal.clone(),
            ExecutorRegistry::new(vec![executor]),
            SchedulerConfig {
                max_concurrency: 2,
                poll_interval_ms: 1,
                ..SchedulerConfig::default()
            },
        );
        (journal, scheduler)
    }

    fn unit(id: &str, capability_id: &str, deps: Vec<WorkDependency>, timeout_ms: u64) -> WorkUnit {
        WorkUnit {
            work_unit_id: WorkUnitId::new(id),
            kind: WorkUnitKind::PureSynthesis,
            capability_id: capability_id.to_string(),
            title: id.to_string(),
            dependencies: deps,
            join_policy: JoinPolicy::AllSucceeded,
            execution_policy: ExecutionPolicy {
                timeout_ms,
                approval_requirement: ApprovalRequirement::None,
                side_effect_class: SideEffectClass::None,
                retry_policy: RetryPolicy {
                    max_attempts: 1,
                    retry_idempotent_only: true,
                },
                idempotency_key: Some(id.to_string()),
                supports_cancellation: true,
            },
            input: Metadata::new(),
            state: OperationState::Planned,
        }
    }

    fn graph(units: Vec<WorkUnit>) -> TaskGraph {
        TaskGraph {
            graph_id: TaskGraphId::new("graph-1"),
            session_id: SessionId::new("session-1"),
            objective_id: ObjectiveId::new("objective-1"),
            plan_revision: 1,
            work_units: units,
            created_at_ms: 1,
        }
    }

    fn persist_graph(journal: &RuntimeJournal, graph: &TaskGraph) {
        let mut store = journal.lock_store().expect("journal lock should work");
        store
            .save_snapshot(
                graph.session_id.clone(),
                Some(graph.objective_id.clone()),
                Some(graph.clone()),
                graph.plan_revision,
                Vec::new(),
                Vec::new(),
                &[],
                None,
            )
            .expect("snapshot should save");
    }

    fn run_for(graph: &TaskGraph) -> SchedulerRun {
        SchedulerRun {
            client_request_id: None,
            session_id: graph.session_id.clone(),
            objective_id: graph.objective_id.clone(),
            graph_id: graph.graph_id.clone(),
            run_id: RunId::new("run-1"),
            plan_revision: graph.plan_revision,
            graph: graph.clone(),
        }
    }

    fn wait_terminal(journal: &RuntimeJournal, session_id: &SessionId) -> ControlPlaneSessionSnapshot {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let snapshot = journal
                .get_session_snapshot(session_id.clone())
                .expect("snapshot should exist");
            if snapshot
                .recent_events
                .iter()
                .any(|event| matches!(event.payload, RuntimeEventPayload::ExecutionCompleted { .. }))
            {
                return snapshot;
            }
            assert!(Instant::now() < deadline, "run did not finish");
            thread::sleep(Duration::from_millis(2));
        }
    }

    #[test]
    fn graph_validation_rejects_cycle() {
        let harness = Arc::new(Harness::default());
        let (_journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor { harness }));
        let graph = graph(vec![
            unit(
                "a",
                "test.block",
                vec![WorkDependency {
                    upstream_work_unit_id: WorkUnitId::new("b"),
                    dependency_kind: DependencyKind::RequiresSuccess,
                }],
                100,
            ),
            unit(
                "b",
                "test.block",
                vec![WorkDependency {
                    upstream_work_unit_id: WorkUnitId::new("a"),
                    dependency_kind: DependencyKind::RequiresSuccess,
                }],
                100,
            ),
        ]);
        let error = scheduler.validate_graph(&graph).expect_err("cycle should fail");
        assert_eq!(error.kind, ControlPlaneErrorKind::InvalidTransition);
    }

    #[test]
    fn graph_validation_rejects_empty_graph() {
        let harness = Arc::new(Harness::default());
        let (_journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor { harness }));
        let graph = graph(Vec::new());

        let error = scheduler.validate_graph(&graph).expect_err("empty graph should fail");

        assert_eq!(error.kind, ControlPlaneErrorKind::InvalidTransition);
    }

    #[test]
    fn graph_validation_rejects_non_planned_initial_state() {
        let harness = Arc::new(Harness::default());
        let (_journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor { harness }));
        let mut running = unit("a", "test.block", Vec::new(), 500);
        running.state = OperationState::Running;
        let graph = graph(vec![running]);

        let error = scheduler.validate_graph(&graph).expect_err("running unit should fail");

        assert_eq!(error.kind, ControlPlaneErrorKind::InvalidTransition);
    }

    #[test]
    fn graph_validation_allows_approval_gates_but_rejects_retry_policies() {
        let harness = Arc::new(Harness::default());
        let (_journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor { harness }));
        let mut approval_required = unit("a", "test.block", Vec::new(), 500);
        approval_required.execution_policy.approval_requirement = ApprovalRequirement::ExplicitUserApproval;
        scheduler
            .validate_graph(&graph(vec![approval_required]))
            .expect("approval-gated units are validated before policy decides dispatch");

        let mut retrying = unit("b", "test.block", Vec::new(), 500);
        retrying.execution_policy.retry_policy.max_attempts = 2;
        let retry_error = scheduler
            .validate_graph(&graph(vec![retrying]))
            .expect_err("retrying unit should fail until retry execution is implemented");

        assert_eq!(retry_error.kind, ControlPlaneErrorKind::InvalidTransition);
    }

    #[test]
    fn scheduler_runs_parallel_ready_nodes_up_to_concurrency_limit() {
        let harness = Arc::new(Harness::default());
        let (journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor {
            harness: Arc::clone(&harness),
        }));
        let graph = graph(vec![
            unit("a", "test.block", Vec::new(), 500),
            unit("b", "test.block", Vec::new(), 500),
            unit("c", "test.block", Vec::new(), 500),
        ]);
        persist_graph(&journal, &graph);
        scheduler.enqueue(run_for(&graph)).expect("run should enqueue");
        harness.wait_for_started_count(2);
        assert_eq!(harness.max_active.load(Ordering::SeqCst), 2);
        harness.release_all();
        let snapshot = wait_terminal(&journal, &graph.session_id);
        assert!(snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::ExecutionCompleted {
                status: RuntimeTerminalStatus::Succeeded,
                ..
            }
        )));
    }

    #[test]
    fn scheduler_unblocks_dependent_node_only_after_required_success() {
        let harness = Arc::new(Harness::default());
        let (journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor {
            harness: Arc::clone(&harness),
        }));
        let graph = graph(vec![
            unit("a", "test.block", Vec::new(), 500),
            unit(
                "b",
                "test.block",
                vec![WorkDependency {
                    upstream_work_unit_id: WorkUnitId::new("a"),
                    dependency_kind: DependencyKind::RequiresSuccess,
                }],
                500,
            ),
        ]);
        persist_graph(&journal, &graph);
        scheduler.enqueue(run_for(&graph)).expect("run should enqueue");
        harness.wait_for_started_count(1);
        assert_eq!(harness.start_order(), vec!["a".to_string()]);
        harness.release_all();
        let _snapshot = wait_terminal(&journal, &graph.session_id);
        assert_eq!(harness.start_order(), vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn never_completing_executor_expires_without_success() {
        let (journal, scheduler) = scheduler_with_executor(Arc::new(NeverCompletingExecutor));
        let graph = graph(vec![unit("a", "test.never", Vec::new(), 1)]);
        persist_graph(&journal, &graph);
        scheduler.enqueue(run_for(&graph)).expect("run should enqueue");
        let snapshot = wait_terminal(&journal, &graph.session_id);
        assert!(snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::WorkUnitLifecycle {
                state: OperationState::Expired,
                ..
            }
        )));
        assert!(snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::ExecutionCompleted {
                status: RuntimeTerminalStatus::TimedOut,
                ..
            }
        )));
    }

    #[test]
    fn cooperative_cancellation_marks_run_cancelled_and_discards_late_success() {
        let harness = Arc::new(Harness::default());
        let (journal, scheduler) = scheduler_with_executor(Arc::new(BlockingExecutor {
            harness: Arc::clone(&harness),
        }));
        let graph = graph(vec![unit("a", "test.block", Vec::new(), 500)]);
        persist_graph(&journal, &graph);
        scheduler.enqueue(run_for(&graph)).expect("run should enqueue");
        harness.wait_for_started_count(1);

        scheduler
            .cancel_operation(OperationCommand {
                session_id: graph.session_id.clone(),
                work_unit_id: WorkUnitId::new("a"),
                plan_revision: graph.plan_revision,
                approval_id: None,
                now_ms: Some(30),
            })
            .expect("cancellation should persist");
        harness.release_all();
        let snapshot = wait_terminal(&journal, &graph.session_id);

        assert!(snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::WorkUnitLifecycle {
                state: OperationState::Cancelled,
                ..
            }
        )));
        assert!(snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::ExecutionCompleted {
                status: RuntimeTerminalStatus::Cancelled,
                ..
            }
        )));
        assert!(!snapshot.recent_events.iter().any(|event| matches!(
            &event.payload,
            RuntimeEventPayload::WorkUnitLifecycle {
                state: OperationState::Succeeded,
                ..
            }
        )));
    }

    #[test]
    fn raw_secret_values_do_not_appear_in_journal_events() {
        let (journal, scheduler) = scheduler_with_executor(Arc::new(SecretFailingExecutor));
        let graph = graph(vec![unit("a", "test.secret", Vec::new(), 500)]);
        persist_graph(&journal, &graph);
        scheduler.enqueue(run_for(&graph)).expect("run should enqueue");
        let snapshot = wait_terminal(&journal, &graph.session_id);
        let json = serde_json::to_string(&snapshot.recent_events).expect("events should serialize");

        assert!(!json.contains("sk-proj-secret-value"));
        assert!(json.contains("[REDACTED_SECRET]"));
    }
}
