# Delegation Lifecycle

The control plane uses a typed operation lifecycle:

```text
planned
-> awaiting_approval | ready
-> dispatched
-> acknowledged
-> running
-> paused
-> succeeded | partially_succeeded | failed | cancelled | expired
```

## Valid Transitions

`valid_transition` in `src-tauri/src/control_plane/engine.rs` validates lifecycle movement. Failed operations can return to `ready` only when the operation is idempotent.

## Dispatch Rules

- Only `ready` operations can dispatch.
- Dispatch is recorded in a `DispatchLedger`.
- A duplicate dispatch for the same operation is blocked.
- Read operations carry idempotency keys.
- Proposed external mutations do not carry idempotency keys and must not be auto-retried after restart.

## Approval Rules

External consequential operations enter `awaiting_approval`.

Approval is valid only when:

- it references the same operation
- it references the same plan
- it references the exact plan revision
- it has not expired

Rejecting or cancelling an approval request records verified non-execution and no receipt.

## Activity Rules

Executor events become `ActivityEvent` values with:

- operation sequence
- state
- progress
- message
- optional required intervention
- typed internal error
- safe raw diagnostic when available
- provenance

Repeated provider event IDs are deduplicated. Reconnects can replay activity after a known sequence.
