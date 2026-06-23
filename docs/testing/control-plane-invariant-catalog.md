# Control Plane Invariant Catalog

Status: Phase 3 initial automated slice, 2026-06-23.

## Event History

| Invariant | Evidence | Status |
| --- | --- | --- |
| Runtime event IDs are stable and unique across restart. | Repository uniqueness checks and `restart_seeds_generated_ids_from_replayed_event_history`. | Proven by automated test |
| Event sequence numbers are contiguous within each session. | `runtime_event_sequences_are_contiguous_per_session` in `src-tauri/src/control_plane/service.rs`. | Proven by automated test |
| Catch-up uses the same per-session cursor model as event allocation. | `get_runtime_events_after_returns_ordered_catch_up_page` and per-session sequence test. | Proven by automated test |
| Duplicate live and catch-up delivery is harmless. | `rejects duplicate and stale events` in `src/test/control-plane-runtime-events.test.ts`. | Proven by automated test |
| Events from another session do not create false gaps. | `ignores interleaved events from another session without creating a false gap`. | Proven by automated test |
| A transition is persisted before publication. | Existing commit-then-publish code path in `RuntimeJournal` and scheduler. | Supported by static analysis |

## Work-Unit State

| Invariant | Evidence | Status |
| --- | --- | --- |
| New scheduler graphs must contain at least one work unit. | `graph_validation_rejects_empty_graph`. | Proven by automated test |
| New scheduler graph work units must start in `planned`. | `graph_validation_rejects_non_planned_initial_state`. | Proven by automated test |
| Terminal states are monotonic. | Existing scheduler late-result and terminal checks. | Proven by automated test |
| Artifacts can only commit while the producing unit is running. | Existing `commit_artifact` guard. | Supported by static analysis |
| Approval-gated work units do not dispatch before scheduler support exists. | `graph_validation_rejects_unsupported_approval_and_retry_policies`. | Proven by automated test |
| Retry is not advertised as implemented. | Validation rejects `maxAttempts != 1`; read policies now use `1`. | Proven by automated test |

## Request And Recovery

| Invariant | Evidence | Status |
| --- | --- | --- |
| Accepted request identity survives restart. | Existing duplicate-after-restart test. | Proven by automated test |
| Generated ID counters do not restart from a per-session sequence cursor. | `restart_seeds_generated_ids_from_replayed_event_history`. | Proven by automated test |
| Interrupted accepted/running requests do not project as still running after restart. | `interrupted_request_after_restart_returns_terminal_snapshot`. | Proven by automated test |
| Duplicate client request with a different fingerprint is rejected. | Existing service dedupe logic. | Supported by automated test |

## Privacy And Safety

| Invariant | Evidence | Status |
| --- | --- | --- |
| Legacy fallback does not persist raw text. | Existing `non_migrated_utterance_does_not_record_raw_text_before_legacy_fallback`. | Proven by automated test |
| Inbox triage does not mutate Mail. | Artifact metadata and provider design. | Supported by static analysis |
| Full Mail bodies are not read by list metadata flow. | Existing Mail provider tests. | Proven by automated test |
| Migrated inbox triage raw utterance and Mail previews in SQLite are bounded/redacted. | Not yet enforced. | Not tested / open risk |
