# Control Plane Phase 2 Scheduler Plan

## Baseline

- Branch: `main`.
- Head: `1affbeba47b5cb82c957f861c633138903aa2593`.
- Head subject: `feat: make rust control plane live authority`.
- Working tree before this plan: clean.
- Extracted prompt: `/Users/pavlosamoshko/Downloads/adaptive_surface_codex_master_prompt_phase2.md`.

## Verified Current Flow

```text
partial voice
  -> TypeScript local reflex path
  -> speculative UI state

final inbox-triage utterance
  -> src/stores/useSurfaceStore.ts
  -> src/lib/control-plane-api.ts submitFinalUtterance()
  -> Tauri command submit_final_utterance
  -> Mutex<ControlPlaneService>
  -> ControlPlaneService::submit_final_utterance()
  -> hardcoded mail.search, triage.classify, artifact.create by work_units index
  -> save_events_and_snapshot()
  -> command emits returned events
  -> command returns completed response
  -> frontend applies response.events
```

Verified baseline items from the Phase 2 prompt:

- `ControlPlaneService` is managed by Tauri state in `src-tauri/src/lib.rs`.
- Inbox triage creates `mail.search`, `triage.classify`, and `artifact.create`.
- `submit_final_utterance` currently waits for the workflow before returning.
- Runtime events are typed, persisted, emitted, and returned, but effectively batched.
- Cancellation records state after acquiring the same service mutex and cannot interrupt running Mail search.
- Capability `timeout_ms` values exist but are not enforced by the service runtime.
- Events and snapshots are committed too coarsely for exact mid-run crash recovery.
- `client_request_id` deduplication is in process memory only.
- Graph execution is workflow-specific and positional.
- `service.rs` owns acceptance, scheduling, execution, event creation, persistence, and artifact building.
- TypeScript fallback remains for non-migrated finalized routes.

## Current Lock And Transaction Map

- Tauri stores `Mutex<ControlPlaneService>`.
- The submit command holds that mutex while validation, graph construction, Mail metadata loading, triage, artifact creation, event creation, and SQLite persistence run.
- Mail metadata retrieval is synchronous and may call Apple Mail metadata providers while the service mutex is held.
- `ControlPlaneRepository::save_events_and_snapshot` writes a batch of events and one snapshot in one SQLite transaction.
- There is no transactionally persisted request ledger.
- Event sequence allocation is in memory before persistence.
- Runtime event publication happens after service completion and after the command has the full response.

## Target Flow

```text
partial voice
  -> TypeScript local reflex path
  -> speculative UI state

final inbox-triage utterance
  -> ControlPlaneClient
  -> submit_final_utterance
  -> service facade validates and durably accepts request
  -> request ledger deduplicates by client_request_id
  -> event journal persists accepted/run/queued events
  -> scheduler enqueue
  -> accepted-run response returns without waiting for executors

scheduler
  -> validates graph
  -> finds ready work units
  -> bounded dispatch through executor registry
  -> workers return typed outcomes only
  -> single writer applies transitions
  -> each transition commits before publish
  -> EventPublisher emits control-plane://runtime-event best effort

frontend
  -> long-lived listener
  -> catch-up by get_runtime_events_after(session_id, after_sequence, limit)
  -> one reducer applies live and replayed events idempotently
```

## Module Boundaries

- `service.rs`: lightweight facade for Tauri commands, request acceptance, snapshots, and command validation.
- `scheduler.rs`: graph validation, readiness, bounded dispatch, cancellation, deadlines, late-result suppression, and run aggregation.
- `executors.rs`: typed capability executor trait, executor registry, inbox-triage executors, and deterministic test doubles.
- `journal.rs`: single transition commit path, sequence allocation, snapshot/projection update, and publish-after-commit boundary.
- `repository.rs`: SQLite and in-memory persistence, request ledger, event queries, schema setup, and recovery reads.
- `publisher.rs`: best-effort Tauri event publisher plus test publisher.
- `contracts.rs`: request/run/work-unit status contracts and catch-up response types.
- Frontend `control-plane-api.ts`: typed submit, event listener, catch-up API.
- Frontend reducer/store: one event path for live, catch-up, browser mock, cancellation, timeout, and final artifact projection.

## State Machines

Request state:

```text
accepted -> running -> completed
accepted -> running -> failed_retryable
accepted -> running -> failed_terminal
accepted -> running -> cancelled
accepted -> running -> timed_out
accepted -> failed_terminal
```

Run state:

```text
accepted -> running -> completed
accepted -> running -> completed_with_partial_failure
accepted -> running -> failed
accepted -> running -> cancelled
accepted -> running -> timed_out
accepted -> interrupted
```

Work-unit state:

```text
queued -> ready -> running -> succeeded
queued -> ready -> running -> failed
queued -> ready -> running -> cancelled
queued -> ready -> running -> expired
queued -> cancelled
queued -> failed
queued -> blocked_or_skipped
```

Terminal states must not transition back to non-terminal states. Late executor results after terminal state are ignored and may only be recorded as safe diagnostics when useful.

## Event Reliability Semantics

- The journal is authoritative; Tauri event delivery is at least once.
- A transition is validated, assigned a sequence, persisted, and projection state is updated in one repository boundary before publication.
- Publication failure must not roll back committed history.
- Frontend catches up with `get_runtime_events_after(session_id, after_sequence, limit)`.
- Frontend reducer remains idempotent for duplicate live/catch-up events, stale sequences, unsupported protocol versions, and terminal late events.

## Cancellation And Deadline Semantics

- Cancellation validates session, run or work-unit, and plan revision.
- Cancellation intent is persisted before signaling executor tokens.
- Queued descendants are cancelled according to graph policy.
- Cooperative executors observe cancellation and return cancellation outcomes.
- Blocking native adapters are isolated from scheduler locks; if they cannot be preempted, the scheduler records cancellation or timeout and suppresses late success.
- Deadlines are enforced by scheduler wrappers, not only metadata.
- A cancelled or expired unit cannot later publish artifacts or success.

## Migration Order

1. Add deterministic scheduler and executor test harness.
2. Extract executor registry, scheduler, journal, publisher, request ledger, and service facade boundaries.
3. Change submit into durable accept-then-run semantics.
4. Add transition-level event commits, post-commit publication, and event catch-up.
5. Replace positional inbox execution with generic graph scheduling.
6. Add cancellation tokens, deadline handling, descendant propagation, and late-result suppression.
7. Add request-ledger recovery and restart idempotency.
8. Add frontend listener, catch-up, response type updates, and reducer coverage.
9. Route inbox triage through the completed runtime.
10. Update docs, run reviewers, fix findings, and run safe verification.

## Affected Files

Likely Rust runtime files:

- `src-tauri/src/control_plane/contracts.rs`
- `src-tauri/src/control_plane/mod.rs`
- `src-tauri/src/control_plane/service.rs`
- `src-tauri/src/control_plane/repository.rs`
- `src-tauri/src/control_plane/scheduler.rs`
- `src-tauri/src/control_plane/executors.rs`
- `src-tauri/src/control_plane/journal.rs`
- `src-tauri/src/control_plane/publisher.rs`
- `src-tauri/src/lib.rs`

Likely frontend files:

- `src/lib/control-plane-api.ts`
- `src/types/control-plane.ts`
- `src/control-plane/runtime-event-reducer.ts`
- `src/stores/useSurfaceStore.ts`
- `src/test/control-plane-runtime-events.test.ts`

Likely docs:

- `docs/architecture/control-plane.md`
- `docs/architecture/runtime-sequence.md`
- `docs/architecture/backend-contracts.md`
- `docs/architecture/ownership-boundaries.md`
- `docs/reports/control-plane-live-authority-report.md`
- `README.md`

## Test And Failure Injection Plan

Rust tests:

- gated executor proves submit returns before execution completion;
- collecting publisher proves persist-before-publish;
- failing repository proves rollback without emitted event;
- graph validator covers duplicate IDs, missing dependencies, cycles, and unavailable capabilities;
- scheduler tests cover serial, parallel, joins, and bounded concurrency;
- cancellation tests cover before dispatch, during cooperative execution, duplicate cancellation, stale revision, and late success suppression;
- timeout tests cover never-completing execution without slow sleeps;
- recovery tests reconstruct service from SQLite and prove duplicate request safety after restart;
- inbox graph test proves no production positional scheduling.

TypeScript tests:

- listener installs once;
- accepted response is separate from terminal completion;
- live and catch-up duplicates are harmless;
- sequence gap can be closed;
- cancellation and timeout project visibly;
- final artifact arrives through the reducer;
- browser mock obeys the same protocol.

## Rollback

- Frontend rollback: disable the migrated Tauri submit path for inbox triage and route through the existing TypeScript compatibility path.
- Backend rollback: keep contracts but unregister the async runtime commands and restore the synchronous service facade if needed.
- Persistence rollback: SQLite schema additions must be backward tolerant. If local journal state becomes invalid, remove only the control-plane database from the app data directory; do not touch Mail or other external data.
- No app bundle replacement or installed-app mutation is part of this phase unless separately authorized.

## Explicit Non-Goals

- No OS, Tauri, Apple Events, Accessibility, filesystem, microphone, network, or shell permission expansion.
- No Mail send, archive, delete, move, label, mark-read, or mailbox mutation.
- No full Mail body persistence.
- No second production workflow migration.
- No UI redesign.
- No planner execution, agent framework, subagent runtime, LangGraph, Hermes, OpenClaw, A2A, or cloud orchestration.
- No JavaScript production dependency.
- No app launch, Tauri dev run, DMG build, installed-app replacement, commit, push, or deploy without separate authorization.
