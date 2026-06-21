# Backend Control Plane Plan

## Findings

- The trusted native boundary is `src-tauri/src/lib.rs`, with provider modules for Apple apps, local files, desktop control, and diagnostics.
- Existing objective, capability, and work-object concepts lived mostly in TypeScript and documentation. There was no Rust-owned typed loop for observation, intent, capability binding, delegation, approval, activity, and provenance.
- The source documents named by the master prompt, including `master_computer_workflow_atlas.md`, were not present in the repository. The implementation must therefore keep atlas handling explicit and absent instead of inventing a corpus.
- Baseline checks before implementation:
  - `npm run typecheck`: passed.
  - `npm test`: passed, 18 files and 72 tests.
  - `cargo check`: passed with an existing EventKit deprecation warning.
  - `cargo test`: passed with the same EventKit warning.
  - `cargo fmt --check`: could not run because `rustfmt` is not installed.
  - `cargo clippy --all-targets --all-features -- -D warnings`: could not run because `clippy` is not installed.

## Plan

1. Add a Rust control-plane module under `src-tauri/src/control_plane/`.
2. Define versioned serializable contracts for observation, context, intent, capability descriptors, target binding, delegation plans, operations, activity events, approval requests, interventions, normalized artifacts, receipts, and recovery snapshots.
3. Implement a deterministic thin slice:
   - synthetic bounded observation
   - context snapshot
   - local intent frame
   - declared capability resolution
   - read-only operation dispatch
   - normalized activity events
   - normalized artifact with provenance
   - proposed external mutation blocked by approval
   - approve, reject, and cancel paths
   - recovery report for stale context, expired approvals, and in-flight non-idempotent mutations
4. Register one Tauri IPC command and a TypeScript wrapper without changing UI rendering.
5. Add focused Rust tests for the architecture behaviors required by the prompt.
6. Add architecture documentation and this implementation report.
7. Run the safe checks, build the local app bundle, update the installed local app using the established workflow, and smoke-check the result.

## Assumptions

- The requested local app update permits rebuilding and replacing `/Applications/Adaptive Surface.app` with the generated app bundle, but not changing signing, notarization, permissions, bundle identifiers, or update infrastructure.
- No live connector should be invoked for the control-plane slice. The executor is deterministic and fake, so tests do not require credentials, GUI automation, or third-party services.
- Because the workflow atlas is absent, this task documents the atlas policy and adds a test that raw atlas content is not part of runtime schemas.
