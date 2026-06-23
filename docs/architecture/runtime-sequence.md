# Runtime Sequence

The live sequence keeps partial voice local and routes the migrated
inbox-triage slice through Rust in the Tauri app.

```mermaid
sequenceDiagram
  participant UI as React/Zustand
  participant Client as ControlPlaneClient
  participant IPC as Tauri IPC
  participant CP as ControlPlaneService
  participant Scheduler as TaskScheduler
  participant Repo as SQLite repository
  participant Mail as Apple Mail metadata adapter
  participant Pub as EventPublisher
  participant Reducer as Runtime-event reducer

  UI->>UI: receiveVoicePartial
  UI->>UI: classifyPartialTranscript
  UI->>UI: speculative intent/transcript UI

  UI->>Client: migrated finalized utterance
  Client->>Client: install runtime-event listener once
  Client->>IPC: submit_final_utterance(input)
  IPC->>CP: typed SubmitObjectiveInput
  CP->>CP: validate and deduplicate clientRequestId
  CP->>CP: create TaskGraph and WorkUnits
  CP->>Repo: commit request ledger, accepted events, snapshot
  CP->>Scheduler: enqueue accepted run
  CP-->>IPC: SubmitObjectiveResponse
  IPC-->>Client: accepted run metadata
  Client->>Repo: get_runtime_events_after(lastSequence)
  Scheduler->>Repo: commit work-unit ready/running
  Scheduler->>Mail: mail.search metadata only
  Mail-->>Scheduler: AppleMailMessage metadata rows
  Scheduler->>Repo: commit work-unit success
  Scheduler->>Repo: commit artifact and run terminal events
  Repo-->>Pub: committed events
  Pub-->>Client: control-plane://runtime-event
  Client-->>UI: live and catch-up events
  UI->>Reducer: reduce events idempotently
  Reducer-->>UI: WorkspacePatch projection
```

If the utterance is outside the migrated Rust slice, the client does not call
`submit_final_utterance`. The existing TypeScript compatibility path runs
instead. If a migrated call reaches Rust but is rejected or errors, the frontend
shows a command-error surface and does not run the legacy executor.

## Startup And Latency

The service opens a narrow SQLite repository under the local app support
directory and replays bounded session snapshots/events. It does not load atlas
content, call a model, or contact external services at startup.

Partial voice remains independent of that startup path, so first-intent UI stays
local and fast.

Final submit no longer waits for Mail metadata, triage, artifact creation, or
run completion. It waits only for validation, request-ledger deduplication, and
the durable accepted-run commit. Progress and completion arrive through the
runtime-event stream or sequence catch-up.

## Cancellation And Deadlines

The scheduler wraps work-unit execution with cancellation tokens and deadlines.
Cooperative executors stop when signaled. Synchronous native adapters are run
outside the journal lock; if they return after cancellation or timeout, the
scheduler discards the late result and does not publish artifacts or success.

## Atlas Policy

Workflow-atlas material remains out of the runtime hot path. If added later, it
must be compiled into stable build-time manifests rather than injected wholesale
into prompts or loaded as raw runtime context.
