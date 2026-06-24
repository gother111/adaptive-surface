# Contributing to Adaptive Surface

Thanks for helping improve Adaptive Surface. This project is a macOS-first
desktop app with native permissions, local context, and approval-gated actions,
so the safest contributions are small, typed, and easy to verify.

## Good first contributions

- Fix documentation that is outdated, machine-specific, or unclear.
- Add deterministic tests for routing, approval safety, and workspace stability.
- Improve frontend-only UI states without changing native access.
- Add examples that demonstrate safe local-first workflows.
- File focused issues when behavior, docs, and implementation disagree.

## Before you change code

1. Read `AGENTS.md`, `README.md`, and the closest feature README or doc.
2. Keep the change focused on one behavior or documentation problem.
3. Preserve existing approval gates for local writes and external actions.
4. Do not broaden macOS permissions, file access, Apple Events, microphone
   access, or external app automation without documenting the privacy impact.

## Local setup

Use Node.js 20.20.0 or newer for local development. If you use `nvm`, run:

```bash
nvm install
```

Then install dependencies:

```bash
npm install
```

## Local checks

Run the checks that match your change:

```bash
npm run typecheck
npm test
```

For Rust or Tauri bridge changes, also run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Pull request checklist

- The change is scoped and explained.
- Relevant tests or type checks pass, or the reason they could not run is stated.
- Native permission, local file, and external automation behavior is unchanged
  unless the pull request explicitly covers that risk.
- Documentation is updated when contributor workflow or user behavior changes.
