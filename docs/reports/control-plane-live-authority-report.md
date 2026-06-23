# Control Plane Live Authority Implementation Report

## Summary

Adaptive Surface now routes migrated finalized inbox-triage utterances into a
managed Rust `ControlPlaneService`. Non-migrated routes remain on the explicit
TypeScript compatibility path until typed Rust task graphs exist for them.
Partial voice remains local and fast.

## Changed Architecture

- Rust owns finalized objective/session records for the migrated route.
- Rust creates task graphs and work units for `mail.search`,
  `triage.classify`, and `artifact.create`.
- Runtime events are ordered globally and persisted.
- The frontend uses one reducer to project runtime events into workspace
  surfaces.
- Browser-only development uses a mock transport that produces the same event
  protocol.
- Migrated control-plane failures fail closed into a visible command-error
  surface instead of running the legacy executor.

## Persistence

The app uses a SQLite repository under the local app support directory for:

- ordered runtime events
- latest session snapshots
- task graphs
- artifact envelopes
- pending approvals inside snapshots

The repository ignores corrupt or unknown-future event payloads during replay.

## Privacy And Safety

The migrated inbox-triage slice reads Mail metadata only. It does not:

- read full message bodies
- write files
- send mail
- archive, delete, label, move, mark, or mutate mailbox state
- broaden Tauri or macOS permissions

## Verification Targets

- Rust: contract serialization and lifecycle coverage remains in
  `engine.rs`; live service coverage is in `service.rs`.
- Frontend: event projection, duplicate/stale rejection, unsupported protocol
  rejection, and browser mock coverage are in
  `src/test/control-plane-runtime-events.test.ts`.

## Rollback

Disable the migrated `submitFinalUtterance` call in `receiveVoiceFinal` to route
inbox triage back to the legacy TypeScript path. Remove the live command
registrations and managed service state if backend rollback is needed. Delete the local
`control-plane.sqlite3` file only if a replay issue affects local control-plane
state; it does not contain source Mail bodies.
