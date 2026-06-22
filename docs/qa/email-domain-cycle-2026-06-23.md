# Email Domain Cycle - 2026-06-23

## Current Manual QA State

- Source journey file: `/Users/pavlosamoshko/Downloads/voice_first_user_journeys_master_9000.md`
- Workbook: `docs/qa/adaptive-surface-user-stories.xlsx`
- Sheet: `Email Manual 9000`
- Queue: `docs/qa/email-domain-journey-test-queue.json`
- Domain queue size: 100 journeys / 500 utterances
- Logged manual rows: 24
- Completed manual journeys: 4
- Current incomplete journey: `VJ-04-01-05` with 4 of 5 utterances logged
- Next manual prompt: `Plan the next steps for inbox triage, but preview the result and ask before any external, irreversible, or high-impact step.`

Manual UI execution is currently blocked because macOS reports the console session as locked. Until the session is unlocked, Computer Use cannot see or operate Adaptive Surface windows, so new prompt-by-prompt manual rows would be unreliable.

## Failure Pattern From Logged Rows

All 24 logged rows failed functional match before the fix.

The repeated behavior was consistent:

- The app displayed a `Recent emails` surface.
- The command used `load_mail_messages`.
- 25 Apple Mail metadata rows loaded.
- No external app opened.
- The app did not synthesize the requested inbox triage output.

The safety boundary held:

- No email was sent, forwarded, archived, deleted, labeled, or modified.
- No full message bodies were read for the broad triage prompts.
- The failure was content and intent handling, not an unsafe external action.

## Root Cause

Broad inbox-triage requests such as catch-up, key decisions, organization, comparison, and next-step planning were falling through to generic local email context handling. The deterministic foundation router treated the prompts as email-list requests, so the runner stopped at raw Mail metadata instead of producing a synthesis surface.

DeepSeek V4 Flash is wired as a final voice intent compiler, but the downstream deterministic router still needs a supported command target. A high-capacity model can improve utterance normalization, but it cannot by itself create a missing local command path.

## Fix Implemented

Commit: `f14f2e6 fix: add inbox triage synthesis route`

Changed files:

- `src/local-context/foundation-intent-router.ts`
- `src/local-context/work-command-router.ts`
- `src/local-context/work-command-runner.ts`
- `src/local-context/work-command-types.ts`
- `src/test/foundation-command-router.test.ts`
- `src/test/foundation-command-lifecycle.test.ts`

The app now routes broad inbox-triage work to `create_email_triage_artifact` instead of `show_recent_emails`.

Supported prompt families:

- Catch me up on inbox triage.
- Find the key decisions, records, and open requests for inbox triage.
- Organize the work and context for inbox triage.
- Compare the available options for inbox triage.
- Plan the next steps for inbox triage.

The new route creates a read-only in-app document from Apple Mail metadata with:

- summary
- sources used
- assumptions
- gaps
- options
- next steps

Safety properties:

- `writesToDisk=false`
- `externalWrite=false`
- `writesToMailbox=false`
- `fullBodiesRead=false`
- no send/reply/archive/delete/label/unsubscribe/reminder action runs

## Verification Completed

Commands run with the bundled Node runtime:

```bash
node_modules/.bin/vitest run src/test/foundation-command-router.test.ts src/test/foundation-command-lifecycle.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/tsc
node_modules/.bin/vite build
node node_modules/@tauri-apps/cli/tauri.js build --bundles app --config '{"build":{"beforeBuildCommand":""}}'
```

Results:

- Targeted router/lifecycle tests passed: 2 files, 27 tests.
- Full test suite passed: 21 files, 102 tests.
- Typecheck passed.
- Frontend production build passed.
- Tauri `.app` bundle build passed.
- Installed `/Applications/Adaptive Surface.app` was updated from the built bundle.
- Installed app was ad-hoc signed after clearing extended attributes.
- Installed app passed code-sign verification.
- Signed build and installed app executable hashes matched after signing:
  `48f84c09c7b0e69ab80ac07139000746c14cc4f147026d662d72468efaef3bb8`

Installed app backup:

- `/Applications/Adaptive Surface.app.backup-20260623-010052`

## Remaining Required Verification

Manual UI re-test still needs to run after the macOS session is unlocked:

1. Finish the missing `VJ-04-01-05` guardrail-first prompt.
2. Re-run the first five inbox-triage journey families against the installed app.
3. Confirm the installed app now displays the inbox triage document, not the raw `Recent emails` list.
4. Log the post-fix observations in `docs/qa/adaptive-surface-user-stories.xlsx`.
5. Continue through the remaining Email domain queue.

## Risk Notes

- The current fix is metadata-only. It improves broad triage shape and safety, but it does not prove thread-level decisions from full message bodies.
- Full evidence extraction will require explicit body/thread reads for selected messages and must stay approval-aware for any external or mailbox-changing action.
- DeepSeek should be verified in the installed UI once the session is unlocked, because current automated checks prove routing behavior but not a visible model-routing trace in the locked desktop.
