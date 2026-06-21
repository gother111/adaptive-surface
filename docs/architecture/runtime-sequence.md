# Runtime Sequence

The implemented sequence is deterministic and local.

```mermaid
sequenceDiagram
  participant UI as Existing React app
  participant IPC as Tauri IPC
  participant CP as Rust control plane
  participant Read as Fake read executor
  participant Policy as Approval policy
  participant Mut as Fake mail adapter

  UI->>IPC: run_control_plane_demo(input)
  IPC->>CP: ControlPlaneDemoInput
  CP->>CP: build ObservationEvent
  CP->>CP: build bounded ContextSnapshot
  CP->>CP: resolve IntentFrame
  CP->>CP: bind declared capabilities
  CP->>CP: build DelegationPlan
  CP->>Read: dispatch context.read
  Read-->>CP: activity events and NormalizedArtifact
  CP->>Policy: evaluate mail.send
  Policy-->>CP: ApprovalRequest
  alt approved
    CP->>Mut: dispatch approved fake mutation
    Mut-->>CP: ExecutionReceipt
  else rejected or cancelled
    CP-->>CP: record verified non-execution
  end
  CP-->>IPC: ControlPlaneRunResult
  IPC-->>UI: typed result
```

## Startup and Latency

The control-plane module does not load large files, call a model, or contact external services on startup. The demo command runs only when called. Its context, intent, routing, and policy decisions are local and deterministic.

## Atlas Policy

The workflow atlas is absent from this repository. Runtime schemas do not embed raw atlas content. If the atlas is added later, it should be compiled at build time into a compact manifest with stable IDs and hashes, then validated separately from startup.
