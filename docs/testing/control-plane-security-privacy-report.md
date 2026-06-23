# Control Plane Security And Privacy Report

Status: Phase 3 initial static slice, 2026-06-23.

## Confirmed Boundaries

- The migrated inbox-triage executor is read-only against Mail metadata.
- The Mail list fallback has tests proving it does not read full bodies.
- Scheduler validation now rejects approval-gated work units until command-side approval execution is implemented.
- Scheduler validation now rejects retry counts above one until retry execution is implemented.

## Open Risks

- `load_local_context_preview` accepts caller-provided roots and index paths and should be aligned with trusted-root checks before release hardening.
- Some native mutation commands rely on frontend approval discipline rather than command-side approval records.
- Tauri config currently has `csp: null` and broad plugin permissions.
- Control-plane SQLite can retain raw final utterance text, Mail subjects, senders, previews, and artifact bodies.
- Corrupt or future SQLite event rows are skipped without a visible recovery diagnostic.
- `webgazer` is GPL-3.0-or-later and remains a release/license review item.

## Not Run

No dependency advisory scanner, license scanner, dynamic privacy inspection, native app launch, or real Mail inspection was run in this pass.

