# Control Plane Risk Register

Status: Phase 3 initial automated slice, 2026-06-23.

| Severity | Risk | Current disposition |
| --- | --- | --- |
| High | Session catch-up could stall because backend sequences were global while catch-up was session-filtered. | Fixed with per-session sequence allocation and tests. |
| High | Restarted services could reuse low generated ID counters after adopting per-session sequence cursors. | Fixed by seeding IDs from replayed event history and tests. |
| High | Restart could mark a request complete in ledger while snapshot still projected running. | Fixed for accepted/running startup reconciliation with terminal failed events and tests. |
| High | Scheduler accepted non-runnable initial states that could spin. | Fixed by requiring non-empty planned graphs. |
| High | Retry policy was declarative only. | Fixed by setting production policies to `maxAttempts: 1` and rejecting unsupported retry counts. |
| High | Approval-gated work units could dispatch if introduced. | Guarded by validation until scheduler approval support exists. |
| Medium | SQLite schema version can be overwritten without a future-version gate. | Open. |
| Medium | In-memory store rollback can drift after repository errors. | Open. |
| Medium | Raw utterance, Mail sender/subject/preview, and artifact command text may persist in SQLite. | Open. |
| Medium | Startup replay scales with total event history. | Open. |
| Medium | Scheduler creates one run thread plus worker threads, with no process-wide run cap. | Open. |
| Medium | Browser/native/manual verification is not automated. | Open. |
