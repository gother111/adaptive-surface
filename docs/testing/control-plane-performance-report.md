# Control Plane Performance Report

Status: Phase 3 initial static/per-test slice, 2026-06-23.

## Current Evidence

- Submit acceptance persists objective and plan events before scheduler execution.
- Native Mail work is outside the journal lock.
- Rust `recent_events` is capped at 80.
- Frontend `seenEventIds` is capped at 160 and workspace patches at 36.
- A typical inbox-triage graph has three work units.

## Open Measurements

Not yet measured:

- cold startup with 1k, 10k, and 50k runtime events;
- SQLite write latency per transition;
- process thread growth under many accepted runs;
- frontend reducer time for large catch-up batches;
- memory and DB growth after long soak runs.

## Proposed MVP Budgets

- Warm durable accept p95 under 150 ms for <=1k events.
- Simple inbox artifact p95 under 1 s with fixture/local indexed Mail metadata.
- Simple inbox run <=15 events and <=12 frontend patches.
- No scheduler control remains 500 ms after terminal completion.
- Idle scheduler wakeups: zero.

