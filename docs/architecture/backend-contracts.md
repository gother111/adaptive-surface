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

## Delegation and Activity

`DelegationPlan` and `DelegatedOperation` represent bounded increments, not large autonomous plans. Each operation has a correlation ID, timeout, retry policy, state, and idempotency key when safe.

`ActivityEvent` normalizes executor-specific progress into a stable stream with deterministic per-operation sequence numbers and deduplicated provider events.

## Approval, Artifacts, and Receipts

`ApprovalRequest` names the target, scope, expected effect, data disclosure, reversibility, preview, expiry, and exact plan revision.

`NormalizedArtifact` distinguishes derived interpretation from source material and committed results.

`ExecutionReceipt` is required before claiming an external mutation succeeded. Reject and cancel paths instead produce verified non-execution.

## Recovery

`RecoverySnapshot` captures the context snapshot, plan, activity events, approvals, artifacts, and receipts. Recovery reports:

- expired approvals
- stale context references
- non-idempotent in-flight operations requiring verification before replay
