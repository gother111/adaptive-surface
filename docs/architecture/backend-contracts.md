# Backend Contracts

The authoritative backend contracts are Rust structs in `src-tauri/src/control_plane/contracts.rs`. They use serde-compatible camelCase JSON where exposed over IPC.

## Observation and Context

- `ObservationEvent` records the active source, app, window, selected object, metadata, freshness, sensitivity, and confidence.
- `ContextReference` stores a stable reference to source material, not an authoritative copy.
- `ContextSnapshot` separates focus, session, related, and unresolved references.

Context freshness is explicit. Recovery can report stale references instead of treating old context as current.

## Intent

`IntentFrame` separates:

- objective
- subject
- workflow family
- lifecycle stage
- desired output
- bindings
- scope
- commitment tier
- risk
- constraints
- confidence by field
- alternatives
- provenance

The deterministic resolver supports local fallback behavior without a cloud model. Cloud inference can be added later behind a provider port that receives redacted bounded context.

## Capabilities and Targets

`CapabilityDescriptor` declares the executable boundary:

- provider
- target kinds
- operation kind
- input and output schema IDs
- read/write classification
- side effect class
- permissions
- cancellation and idempotency support
- availability
- provenance guarantee

`TargetBinding` links an intent to a declared capability and source reference. Unknown or unavailable capabilities return `CapabilityUnavailable`.

The live scheduler path also exposes `SemanticCapabilityDescriptor`, which now
declares operation kind, read/write class, side-effect class, reversibility, and
required permissions so policy can evaluate a work unit before dispatch.

## Delegation and Activity

`DelegationPlan` and `DelegatedOperation` represent bounded increments, not large autonomous plans. Each operation has a correlation ID, timeout, retry policy, state, and idempotency key when safe.

`ActivityEvent` remains the demo-fixture activity contract. The live service uses
`RuntimeEventEnvelope`, which carries protocol version, globally unique event
ID, per-session monotonic sequence, session/objective IDs, plan revision,
optional graph and work-unit IDs, run ID, timestamp, and a discriminated payload.

`TaskGraph`, `WorkUnit`, `ExecutionPolicy`, `JoinPolicy`, and `WorkDependency`
represent finalized execution. Work units are the only objects that bind
capabilities to executable work.

`SubmitObjectiveResponse` now returns accepted-run metadata: route, session ID,
objective ID, run ID, optional graph ID, plan revision, accepted sequence,
completion flag, pending approvals, and a snapshot. It may include initial
acceptance events for compatibility, but frontend progress must not depend on a
completed event batch in the response.

`RuntimeEventsAfterInput` and `RuntimeEventsAfterResponse` provide bounded
per-session sequence catch-up for missed live delivery.

`RequestLedgerRecord` persists `clientRequestId`, session/objective/run/graph
identity, plan revision, request status, accepted timestamp, optional terminal
timestamp, and a safe diagnostic. This is the restart-safe deduplication record.

## Approval, Artifacts, and Receipts

`ApprovalRequest` names the target, scope, expected effect, data disclosure,
reversibility, redacted preview, expiry, capability, side-effect class, reason,
and exact plan revision. New approval records include `ApprovalBinding`, which
ties a one-time approval to the current operation, plan revision, capability,
target binding, normalized input, expected effect, disclosure summary, expiry,
and context snapshot revision.

`NormalizedArtifact` distinguishes derived interpretation from source material and committed results.

`ArtifactEnvelope` is the live artifact contract projected to the frontend. It
stores title, summary, optional body, bounded display rows, source references,
metadata, source capability, and artifact status. The inbox-triage slice stores
Mail metadata rows only, not full message bodies.

`ExecutionReceipt` is required before claiming an external mutation succeeded. Reject and cancel paths instead produce verified non-execution.

## Recovery

`RecoverySnapshot` captures the context snapshot, plan, activity events, approvals, artifacts, and receipts. Recovery reports:

- expired approvals
- stale context references
- non-idempotent in-flight operations requiring verification before replay

`ControlPlaneSessionSnapshot` is the live persisted snapshot. It captures the
latest task graphs, artifact envelopes, pending approvals, recent runtime
events, plan revision, and the next sequence for that session. The SQLite
repository ignores corrupt or unknown-future runtime events while replaying.

The live repository also persists a request ledger and unique
`(session_id, sequence)` event ordering. Event IDs remain globally unique. Every
scheduler transition is appended before publication, so the event journal is the
recovery source of truth.
