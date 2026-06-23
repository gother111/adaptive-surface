# Email Domain Cycle - 2026-06-23

## Current Manual QA State

- Source journey file: `/Users/pavlosamoshko/Downloads/voice_first_user_journeys_master_9000.md`
- Workbook: `docs/qa/adaptive-surface-user-stories.xlsx`
- Sheet: `Email Manual 9000`
- Queue: `docs/qa/email-domain-journey-test-queue.json`
- Domain queue size: 100 journeys / 500 utterances
- Logged manual rows: 43
- Completed manual journeys through current cycle: 7 (`VJ-04-01-01` through `VJ-04-01-07`, including post-fix retest rows)
- Current incomplete journey: none in the inbox-triage set through `VJ-04-01-07`
- Next manual prompt: `Coordinate and carry out the approved action for inbox triage.`

Manual UI execution is unblocked. The installed app is available for prompt-by-prompt manual testing through Computer Use.

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

## Post-Unblock Update

Follow-up fix: draft-artifact and operating-plan refinements for inbox triage.

Changed behavior:

- `Draft the main business artifact for inbox triage.` now routes to `create_email_triage_artifact` with `mode=draft_artifact`.
- Draft artifacts now display as `Inbox triage draft` and include a preview-only draft frame, working version, input scope, first-version lanes, and an approval boundary.
- `plan_next_steps` artifacts now include an `Operating Plan` section with owner, metadata date range, dependencies, constraints, checkpoints, and fallback path.
- The local app remains metadata-only for broad triage prompts: no full message bodies, mailbox writes, disk writes, or external app actions are run.

Verification completed after the follow-up fix:

```bash
node_modules/.bin/vitest run src/test/foundation-command-router.test.ts src/test/foundation-command-lifecycle.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/vite build
node node_modules/@tauri-apps/cli/tauri.js build --bundles app --config '{"build":{"beforeBuildCommand":""}}'
```

Results:

- Targeted router/lifecycle tests passed: 2 files, 28 tests.
- Full test suite passed: 21 files, 103 tests.
- Typecheck passed.
- Frontend production build passed with the existing large-bundle warning only.
- Tauri `.app` bundle build passed with the existing EventKit macOS availability warnings only.
- Installed `/Applications/Adaptive Surface.app` was replaced from the built bundle and ad-hoc signed.
- Installed app passed code-sign verification.
- Signed build and installed app executable hashes matched:
  `b43c00ed7e3d150f6d9708fa54af9f8c3218b759671af8b0df50c1f1126ee3a0`

Installed app backup:

- `/Applications/Adaptive Surface.app.backup-20260623-071344`

Manual installed-app retests logged in `docs/qa/adaptive-surface-user-stories.xlsx`:

- Row 28: `VJ-04-01-06` Direct prompt now passes as an `Inbox triage draft` document through `email_triage_artifact`.
- Row 29: `VJ-04-01-05` Guardrail-first prompt now passes as an `Inbox triage plan` document with an `Operating Plan`.
- Rows 30-33: `VJ-04-01-06` Conversational, Context-rich, Outcome-first, and Guardrail-first prompts all pass as preview-only `Inbox triage draft` documents through `email_triage_artifact`.

Remaining work:

- Continue `VJ-04-01-08`, starting with `Coordinate and carry out the approved action for inbox triage.`
- Continue the remaining Email domain queue after the inbox-triage draft family.
- Verify DeepSeek-backed behavior on prompt families that actually require model synthesis rather than deterministic local routing.

## Review/Approval Follow-Up

Follow-up fix: approval-safe review artifact for inbox triage.

Pre-fix manual installed-app rows:

- Rows 34-35, 37-38: direct, conversational, outcome-first, and guardrail-first review/approval prompts failed by routing to `Recent emails` through `load_mail_messages`.
- Row 36: context-rich wording partially improved by routing to an `Inbox triage records` artifact, but still failed because it did not perform a criteria-based quality/risk review.
- All pre-fix rows remained safe: no external app opened, no mailbox writes occurred, and no full message bodies were read.

Changed behavior:

- Review, approval, proposed-work, quality, risk, criteria, defect, omission, uncertainty, and correction wording now routes to `create_email_triage_artifact` with `mode=review_approval`.
- Review artifacts now display as `Inbox triage review`.
- The artifact explicitly states that approval status is not approved, keeps the result in preview, names review criteria, states the metadata-only evidence scope, identifies findings and risks, and proposes corrections before any later approval step.
- The local app remains metadata-only for broad review prompts: no full message bodies, mailbox writes, disk writes, or external app actions are run.

Verification completed after the review/approval fix:

```bash
node_modules/.bin/vitest run src/test/foundation-command-router.test.ts src/test/foundation-command-lifecycle.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/vite build
node node_modules/@tauri-apps/cli/tauri.js build --bundles app --config '{"build":{"beforeBuildCommand":""}}'
```

Results:

- Targeted router/lifecycle tests passed: 2 files, 29 tests.
- Full test suite passed: 21 files, 104 tests.
- Typecheck passed.
- Frontend production build passed with the existing large-bundle warning only.
- Tauri `.app` bundle build passed with the existing EventKit macOS availability warnings only.
- Generated bundle metadata extended attributes were cleared before signing.
- Installed `/Applications/Adaptive Surface.app` was replaced from the built bundle and ad-hoc signed.
- Installed app passed code-sign verification.
- Signed build and installed app executable hashes matched:
  `8b4132b7c4df940fae286b3b83c4d4930512db43b510d040865f310e40919f9a`

Installed app backup:

- `/Applications/Adaptive Surface.app.backup-20260623-073053`

Manual installed-app retests logged in `docs/qa/adaptive-surface-user-stories.xlsx`:

- Rows 39-43: `VJ-04-01-07` Direct, Conversational, Context-rich, Outcome-first, and Guardrail-first prompts all pass as preview-only `Inbox triage review` documents through `email_triage_artifact` with `mode=review_approval`.
- All post-fix rows remained safe: no external app opened, no mail was sent, forwarded, archived, deleted, labeled, or modified, no full message bodies were read, and the artifact marked `writesToDisk=false`, `externalWrite=false`, `writesToMailbox=false`, and `fullBodiesRead=false`.
