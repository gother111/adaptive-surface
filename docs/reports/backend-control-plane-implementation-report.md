# Backend Control Plane Implementation Report

Current status: this report describes the earlier deterministic demo foundation.
The demo remains as an internal Rust fixture, but it is no longer exposed over
the production Tauri IPC command surface. The live authority path is documented
in `docs/reports/control-plane-live-authority-report.md`.

## 1. Executive result

The backend control-plane foundation is implemented as a Rust/Tauri architecture slice. The most important outcome is that Adaptive Surface now has typed backend boundaries for context, intent, capabilities, delegation, activity, approval, provenance, and recovery, with a deterministic end-to-end test path that does not call cloud services or live external apps.

This is a foundation, not a full live connector system. Real connector dispatch, automatic startup persistence, and workflow-atlas compilation remain future work.

## 2. Repository state before the work

Observed facts:

- The trusted native entrypoint was `src-tauri/src/lib.rs`, registering Apple app, local file, desktop control, diagnostics, and provider commands.
- Objective routing, work-object handling, capability policy, and approval concepts already existed mostly in TypeScript and docs.
- No Rust-owned control-plane loop existed for observation -> context -> intent -> capability binding -> delegation -> approval -> activity -> provenance.
- The prompt-named files `adaptive_surface_context_intent_architecture.md`, `adaptive_surface_visual_interaction_frontend_architecture.md`, and `master_computer_workflow_atlas.md` were not present in the repo.
- The worktree already had unrelated uncommitted gaze/package/frontend changes before this task.

Baseline evidence:

- `npm run typecheck`: passed.
- `npm test`: passed, 18 files and 72 tests.
- `cargo check`: passed with an existing EventKit warning.
- `cargo test`: passed with 3 existing Rust tests.
- `cargo fmt --check`: blocked because `rustfmt` is not installed.
- `cargo clippy --all-targets --all-features -- -D warnings`: blocked because `clippy` is not installed.

Inference:

- The app had useful capability and objective vocabulary, but backend execution boundaries were not yet authoritative in the Rust core.

## 3. Architecture implemented

The new Rust module is `src-tauri/src/control_plane/`.

- `contracts.rs` owns the serializable backend contract layer.
- `engine.rs` owns deterministic control-plane behavior, policy gates, fake executors, activity replay/deduplication, lifecycle validation, recovery reporting, and JSON recovery snapshot helpers.
- `engine.rs` keeps `run_control_plane_demo` as an internal deterministic
  fixture for contract and lifecycle tests.
- `src/types/control-plane.ts` and `src/lib/control-plane-api.ts` provide a typed frontend IPC boundary.

The design enforces "the surface owns the experience; existing tools own the work" by requiring every executable operation to bind to a declared `CapabilityDescriptor`. The deterministic slice can summarize bounded context, but the proposed `mail.send` mutation is not executed until a policy-created approval request for the exact plan revision is approved.

## 4. Exact changes

Rust backend:

- `src-tauri/src/control_plane/mod.rs`: module boundary and exports.
- `src-tauri/src/control_plane/contracts.rs`: typed contracts for observation, context, intent, capability, target binding, delegation, activity, approval, intervention, artifacts, receipts, recovery, and demo input/output.
- `src-tauri/src/control_plane/engine.rs`: deterministic slice, state machine, policy gate, activity log, dispatch ledger, fake executors, recovery, JSON snapshot helpers, and tests.
- `src-tauri/src/lib.rs`: no longer registers the demo command in production
  IPC; live control-plane commands are registered separately.

Typed IPC/shared contracts:

- `src/types/control-plane.ts`: TypeScript mirror of the command input and result shape.
- `src/lib/control-plane-api.ts`: typed Tauri invoke wrapper.

Persistence/migrations:

- No schema migration was added.
- Recovery is represented as `RecoverySnapshot` plus JSON save/load helpers. It is not yet automatically attached to app startup or app-data storage.

Connectors/executors:

- Added deterministic fake read and fake mail executors for tests.
- No live Mail, Calendar, file, shell, browser, OS, or network mutation is performed.

Tests/evaluation:

- Added 17 Rust control-plane tests, raising Rust tests from 3 to 20.
- Tests cover stale context, reference resolution, intent update, fail-closed capability lookup, lifecycle transitions, duplicate dispatch prevention, bounded read dispatch, cancellation, approval gating, plan-revision-bound approval, error normalization, event replay/deduplication, restart recovery, provenance, atlas absence, JSON recovery roundtrip, and the deterministic end-to-end slice.

Documentation and `AGENTS.md`:

- `docs/plans/backend-control-plane-plan.md`
- `docs/architecture/control-plane.md`
- `docs/architecture/ownership-boundaries.md`
- `docs/architecture/backend-contracts.md`
- `docs/architecture/delegation-lifecycle.md`
- `docs/architecture/runtime-sequence.md`
- `docs/reports/backend-control-plane-implementation-report.md`
- `AGENTS.md`: durable backend control-plane rules.

Build/configuration:

- No package dependency, Tauri config, capability file, signing, notarization, bundle ID, or permission change was made by this task.

## 5. End-to-end flow now supported

The implemented slice:

1. Accepts `ControlPlaneDemoInput`.
2. Builds a synthetic `ObservationEvent`.
3. Builds a bounded `ContextSnapshot` for active window and selected text.
4. Resolves an `IntentFrame` with objective, subject binding, workflow family, lifecycle stage, commitment, risk, confidence, constraints, and provenance.
5. Resolves declared capabilities into `TargetBinding` values.
6. Builds a narrow `DelegationPlan`.
7. Dispatches `context.read` through a deterministic fake read executor.
8. Emits ordered `ActivityEvent` records.
9. Produces a `NormalizedArtifact` with source provenance.
10. Routes a proposed `mail.send` operation into `awaiting_approval`.
11. Supports approve, reject, and cancel paths.
12. Produces an `ExecutionReceipt` only after approval, or verified non-execution after reject/cancel.
13. Captures a `RecoverySnapshot` and recovery report.

## 6. Why this is better than before

Ownership boundaries:

- Before: backend commands and frontend routing existed, but no single Rust control-plane contract layer tied them together.
- After: Rust contracts make the supervision layer explicit and keep external systems authoritative.

Context handling:

- Before: context was mostly provider-specific.
- After: context references are bounded, typed, freshness-aware, and provenance-preserving.

Intent representation:

- Before: intent routing existed mainly as local frontend classifiers.
- After: backend `IntentFrame` separates objective, subject, scope, commitment, risk, confidence, and alternatives.

External delegation:

- Before: actions were not modeled as backend delegated operations.
- After: operations bind to declared capabilities and lifecycle states.

Safety and approval:

- Before: approval policy existed in TypeScript, but not in a Rust delegation lifecycle.
- After: external consequential mutation is blocked until approval tied to an exact plan revision.

Cancellation/recovery:

- Before: no backend recovery contract for pending operations.
- After: cancellation is explicit, recovery reports stale context, expired approvals, and non-idempotent operations requiring verification.

Provenance:

- Before: provider data had limited cross-step provenance.
- After: observations, artifacts, activity events, and receipts carry provenance.

Testability:

- Before: 3 Rust tests.
- After: 20 Rust tests, including a deterministic complete slice.

Extensibility:

- Before: future connectors had no common backend contract.
- After: native adapters, MCP clients, browser/computer-use agents, and APIs can normalize behind declared capabilities.

Startup/latency:

- No runtime hot-path model call, network call, or raw atlas load was added. The demo command runs only when invoked.

## 7. Verification evidence

Commands run after implementation:

- `npm run typecheck`: passed.
- `npm test`: passed, 18 files and 72 tests.
- `cargo check`: passed, with existing EventKit warning.
- `cargo test`: passed, 20 tests.
- `cargo fmt --check`: blocked, `cargo-fmt` is not installed.
- `cargo clippy --all-targets --all-features -- -D warnings`: blocked, `cargo-clippy` is not installed.
- `npm run build`: passed, with existing Vite chunk-size warning.
- `npm run tauri:app`: passed and built the app bundle.

Important evidence:

- Rust test count increased from 3 to 20.
- Tauri build artifact: `src-tauri/target/release/bundle/macos/Adaptive Surface.app`.
- Built executable hash after install: `416972eaa3d06090efac2dcda80ad624431e3bd3c8626b6a752c9653c8fb012f`.

Known non-regression warnings:

- Existing EventKit Objective-C warnings remain.
- Existing Vite chunk-size warning remains.
- Rustfmt and Clippy cannot run until the local Rust toolchain has those components installed.

## 8. Local app update

- Local app rebuilt: yes, using `npm run tauri:app`.
- Generated artifact path: `src-tauri/target/release/bundle/macos/Adaptive Surface.app`.
- Installed app updated: yes, copied to `/Applications/Adaptive Surface.app` with `ditto`.
- Installed hash verification: passed. The installed executable hash matches the built executable hash.
- App launched: yes.
- Smoke-test result: the installed app process started as `/Applications/Adaptive Surface.app/Contents/MacOS/adaptive-surface`, then quit cleanly via AppleScript. No matching process remained afterward.
- No signing, notarization, bundle identifier, update channel, or permission configuration was changed.

## 9. Remaining gaps

- Real connector executors are not implemented in this slice.
- Recovery JSON helpers are not yet wired into automatic app startup or app-data persistence.
- The workflow atlas compiler/validator is not implemented because the atlas is absent from the repository.
- No live IPC invocation was driven from the visual UI; command registration is verified by Tauri compile/build and Rust tests.
- Rustfmt and Clippy remain unavailable in the installed Rust toolchain.
- Existing EventKit availability/deprecation warnings should be addressed separately.

Deliberate non-scope:

- No frontend visual redesign.
- No voice, gaze, camera, gesture, layout, color, or CSS change.
- No permission broadening.
- No live external mutation.

## 10. Review guide

Recommended review order:

1. `docs/architecture/control-plane.md`
2. `src-tauri/src/control_plane/contracts.rs`
3. `src-tauri/src/control_plane/engine.rs`
4. `src-tauri/src/lib.rs`
5. `src/types/control-plane.ts`
6. `src/lib/control-plane-api.ts`
7. `docs/architecture/delegation-lifecycle.md`
8. `AGENTS.md`

Fastest local verification:

```bash
npm run typecheck && npm test && (cd src-tauri && cargo test)
```
