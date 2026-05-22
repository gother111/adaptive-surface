# Adaptive Surface Agent Instructions

## Project Summary

Adaptive Surface is a macOS-first desktop app scaffold built with Tauri 2,
React 19, TypeScript, Vite, Tailwind CSS v4, shadcn-style UI primitives,
Zustand, cmdk, Sonner, and tldraw.

The app includes a native Tauri shell, global shortcut support, JSON-backed
surface rendering, tldraw canvas surfaces, a floating microphone flow, Web
Speech API fallback behavior, Zustand state prepared for agent streaming, local
context surfaces, and Rust commands that bridge the frontend to macOS and local
providers.

Treat repository files as the source of truth. If this file, README.md, docs,
configuration, and code disagree, call out the mismatch before changing
behavior.

## Safety Boundary

This repository controls a local desktop app with native macOS permissions and
local data access. Changes that touch native integrations, permissions, Tauri
capabilities, Rust bridge code, AppleScript, local files, app bundling, or the
installed app require plan-first mode before edits.

Plan-first mode means:

- inspect the relevant files first
- explain the intended change and risk
- get explicit approval when the change broadens access, writes local data,
  changes external state, or affects installed app behavior
- verify with the smallest safe command that proves the change

Do not launch the native app, build DMGs, replace installed apps, reset
permissions, install dependencies, commit, push, delete, or run destructive
commands unless explicitly asked.

## Autonomy and Communication

- Default to taking the next useful local step when it is reversible, repo-local,
  and within the user's requested scope.
- Do not ask permission for ordinary reading, searching, targeted frontend edits,
  documentation updates, formatting, or safe local verification.
- Ask first before native permission changes, Tauri capability changes, local data
  writes, app launch, app replacement, dependency installation, deploys, commits,
  pushes, or choices that materially affect user-facing behavior.
- Keep progress updates short and practical. Mention what was found, what is
  changing, and any blocker.
- Keep final answers compact by default. Use the full done-definition detail for
  native, risky, broad, or explicitly requested review work.

## Protected Zones

Treat these files, directories, and capabilities as security-sensitive:

- Microphone and speech recognition flows, including `src/voice/`,
  `src/components/voice/`, Web Speech usage, future native speech providers,
  `NSMicrophoneUsageDescription`, and `NSSpeechRecognitionUsageDescription`.
- AppleScript and Apple Events, including `src-tauri/src/apple/applescript.rs`,
  Mail, Calendar, Reminders, Contacts, Notes fallbacks, `osascript`, and
  `NSAppleEventsUsageDescription`.
- Mail, Calendar, Reminders, Contacts, and Notes permissions and providers,
  including `src-tauri/src/apple/`, `src-tauri/src/providers/`,
  `src-tauri/Info.plist`, and related frontend capability definitions.
- Local file access, trusted roots, file indexing, file search, file reads, and
  filesystem plugin permissions, including `src-tauri/src/local_files.rs`,
  `load_local_context_preview`, `search_local_files`, `read_local_file`, and
  `src-tauri/capabilities/default.json`.
- Rust Tauri commands and bridge code, including `src-tauri/src/lib.rs`,
  `src-tauri/src/main.rs`, native helper bridges, provider modules, and any
  invoke handler changes.
- Tauri app configuration and capabilities, including
  `src-tauri/tauri.conf.json`, `src-tauri/capabilities/`,
  `src-tauri/gen/schemas/`, `macOSPrivateApi`, CSP settings, bundle settings,
  plugins, and entitlement-like behavior.
- The installed app at `/Applications/Adaptive Surface.app`. Do not replace,
  move, delete, launch, or use it for verification unless explicitly asked.
- Generated bundles, DMGs, `dist/`, `src-tauri/target/`,
  `src-tauri/target/release/bundle/`, and other build artifacts. Do not edit
  generated output by hand.
- Any `.env`, `.env.*`, local config, secrets, credentials, tokens, OAuth
  client values, or machine-specific files. Never print secret values in logs,
  docs, or chat.

## Required Read Order

Before editing, read the smallest relevant set of files in this order:

1. `AGENTS.md`
2. `README.md`
3. `package.json`
4. Relevant frontend files under `src/`
5. Relevant Rust and Tauri config files under `src-tauri/`
6. Relevant docs or feature-specific READMEs, such as `src/voice/README.md`,
   `src/capabilities/README.md`, or files under `docs/`

Do not front-load the whole repository. Expand only when the first files show
the task needs more context.

## Safe Verification Commands

Prefer the smallest safe verification command that matches the change:

```bash
npm run typecheck
npm test
cargo check
cargo test
```

Use `npm run dev` only for frontend UI verification when needed and explicitly
safe. Do not run `npm run tauri:dev`, `npm run tauri:build`,
`npm run tauri:app`, `npm run dmg`, or app launch commands unless explicitly
asked.

## Native Permission Rules

- Do not add, broaden, or normalize native permissions without explicit
  approval.
- Do not enable computer control, broader filesystem access, Apple Events,
  Accessibility, Automation, shell execution, or app integrations casually.
- Do not add new trusted roots or expand file access without explicit approval.
- Do not change Mail, Calendar, Reminders, Contacts, Notes, microphone, speech,
  or local-file behavior without explaining the permission and privacy impact.
- Do not replace `/Applications/Adaptive Surface.app` unless explicitly asked.
- Treat local integrations as security-sensitive, even when they appear to be
  read-only.
- Preserve approval gates for local writes, external writes, destructive
  actions, and anything that sends, creates, updates, deletes, or opens another
  app.

## Change Rules

- Inspect before editing. Prefer repository facts over assumptions.
- Keep diffs small and focused on the requested task.
- For native, Tauri, Rust, permission, filesystem, AppleScript, or installed-app
  work, provide a plan before editing and wait for explicit approval when access
  expands or behavior changes.
- Prefer typed interfaces, existing stores, existing capability boundaries, and
  existing Tauri command patterns over ad hoc new paths.
- Do not silently broaden scope into product redesign, broad refactoring,
  deployment, cleanup, app replacement, dependency installation, or permission
  changes.
- Do not edit generated bundles, DMGs, target folders, lockfiles, package
  files, or app code unless the task explicitly requires it.
- Verify with the smallest safe command that proves the change.
- Summarize changed files, commands run, pass/fail status, and remaining risks.

## Safe vs Risky Work

Usually safe, when scoped and verified:

- Small UI, copy, styling, or type-only changes in frontend files
- Documentation-only updates
- Tests that do not require native app launch or permission prompts
- Read-only inspection of repo files and configuration

Risky and plan-first:

- Native integrations, Rust commands, Tauri plugin setup, invoke handlers, and
  native helper bridges
- Microphone, speech recognition, AppleScript, Apple Events, Automation,
  Accessibility, Mail, Calendar, Reminders, Contacts, Notes, local files, or
  trusted roots
- Tauri capabilities, `Info.plist`, `tauri.conf.json`, CSP, private macOS API
  settings, shell or filesystem permissions
- Any build, DMG, `/Applications/Adaptive Surface.app` replacement, app launch,
  permission reset, dependency installation, deploy, commit, or push
- Any change that writes local data, sends messages, creates calendar events,
  updates reminders, drafts or sends mail, reads private files, or changes
  external state

## Done Definition

A task is done only when:

- The requested scope is complete and no unrelated files were changed.
- Protected-zone changes followed plan-first mode and approval requirements.
- Relevant verification ran, or the reason it could not run is stated.
- The final summary lists changed files, exact verification commands, pass/fail
  status, deviations from plan, remaining risks, and rollback guidance.
- Application code, generated build output, installed apps, dependencies, git
  history, and system permissions were not changed unless explicitly requested.
