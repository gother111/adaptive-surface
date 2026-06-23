# Ownership Boundaries

Adaptive Surface is the local control plane. It owns the experience and supervision layer, not the authoritative work product.

## Adaptive Surface Owns

- Current objective and session continuity.
- Typed references to source context.
- Bounded working-set snapshots.
- Intent hypotheses and confidence.
- Target and capability resolution.
- Delegation planning.
- Approval and intervention state.
- Activity normalization and replay.
- Provenance and execution receipts.
- Temporary session recovery evidence.

## External Systems Own

- Mail messages and send authority.
- Calendar events and scheduling authority.
- Files and filesystem writes.
- Documents, spreadsheets, and design files.
- Browser transactions.
- Domain-specific validation and computation.
- Native undo/history where available.

## Enforced Rules

- Model or heuristic output does not directly execute OS, network, or connector actions.
- Every executable step binds to a declared `CapabilityDescriptor`.
- Unknown or unavailable capabilities fail closed.
- External mutations require policy evaluation and an approval request.
- A native write is not claimed as successful without an `ExecutionReceipt` or verified non-execution.
- Cached context is reference-first and bounded by freshness and provenance.

## Persistence Rule

The control plane may persist IDs, references, derived metadata, bounded snapshots, activity events, approvals, receipts, and provenance. It must not silently become a duplicate Mail, Calendar, filesystem, spreadsheet, design, or project database.

The live repository stores ordered runtime events and session snapshots in a
local SQLite database. For inbox triage it stores Mail metadata-derived rows and
artifact summaries only; it does not store full message bodies or mutate the
mailbox.

## Speculative Versus Authoritative UI

- Partial transcripts and first intent labels are speculative and owned by the
  frontend.
- Finalized Tauri utterances enter Rust first.
- The frontend runtime-event reducer projects Rust events into existing
  workspace surfaces and rejects duplicate, stale, or unsupported-protocol
  events.
- Compatibility fallback for non-migrated routes is explicit and should shrink
  as more routes move behind Rust capabilities.
