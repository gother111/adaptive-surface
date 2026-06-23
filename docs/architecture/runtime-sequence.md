# Runtime Sequence

The live sequence keeps partial voice local and routes the migrated
inbox-triage slice through Rust in the Tauri app.

```mermaid
sequenceDiagram
  participant UI as React/Zustand
  participant Client as ControlPlaneClient
  participant IPC as Tauri IPC
  participant CP as ControlPlaneService
  participant Repo as SQLite repository
  participant Mail as Apple Mail metadata adapter
  participant Reducer as Runtime-event reducer

  UI->>UI: receiveVoicePartial
  UI->>UI: classifyPartialTranscript
  UI->>UI: speculative intent/transcript UI

  UI->>Client: migrated finalized utterance
  Client->>IPC: submit_final_utterance(input)
  IPC->>CP: typed SubmitObjectiveInput
  CP->>Repo: replay/load current session snapshot
  CP->>CP: accept objective and allocate plan revision
  CP->>CP: create TaskGraph and WorkUnits
  CP->>Mail: mail.search metadata only
  Mail-->>CP: AppleMailMessage metadata rows
  CP->>CP: triage.classify and artifact.create
  CP->>Repo: append ordered RuntimeEvents
  CP->>Repo: save ControlPlaneSessionSnapshot
  CP-->>IPC: SubmitObjectiveResponse
  IPC-->>Client: ordered RuntimeEvents
  Client-->>UI: response
  UI->>Reducer: reduce events
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

## Atlas Policy

Workflow-atlas material remains out of the runtime hot path. If added later, it
must be compiled into stable build-time manifests rather than injected wholesale
into prompts or loaded as raw runtime context.
