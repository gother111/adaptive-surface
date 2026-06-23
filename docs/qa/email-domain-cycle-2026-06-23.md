# Email Domain Cycle - 2026-06-23

## Current Manual QA State

- Source journey file: `/Users/pavlosamoshko/Downloads/voice_first_user_journeys_master_9000.md`
- Workbook: `docs/qa/adaptive-surface-user-stories.xlsx`
- Sheet: `Email Manual 9000`
- Queue: `docs/qa/email-domain-journey-test-queue.json`
- Domain queue size: 100 journeys / 500 utterances
- Logged manual rows: 63
- Completed manual journeys through current cycle: 9 (`VJ-04-01-01` through `VJ-04-01-09`, including post-fix retest rows)
- Current incomplete journey: none in the inbox-triage set through `VJ-04-01-09`
- Next manual prompt: `Close the work and capture lessons for inbox triage.`

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

## Approved-Action Follow-Up

Follow-up fix: approval-gated action coordination artifact for inbox triage.

Pre-fix manual installed-app rows:

- Rows 44-45, 47-48: direct, conversational, outcome-first, and guardrail-first approved-action prompts failed by routing to `Recent emails` through `load_mail_messages`.
- Row 46: context-rich wording partially improved by routing to an `Inbox triage records` artifact, but still failed because it did not produce action scope, confirmation, execution result, exception log, or rollback status.
- All pre-fix rows remained safe: no external app opened, no mailbox writes occurred, and no full message bodies were read.

Changed behavior:

- Coordinate, carry-out, approved-action, requested-action, execution, confirmation, scope, target, recipient, permission, timing, rollback, external, irreversible, and high-impact wording now routes to `create_email_triage_artifact` with `mode=coordinate_action`.
- Action artifacts now display as `Inbox triage action`.
- The artifact explicitly states that execution status is not executed when no exact approved action record is present.
- The artifact lists scope, unresolved target/recipient/value/permission/timing fields, required confirmation, no-op result, exception reason, and rollback status.
- The local app remains metadata-only for broad approved-action prompts: no full message bodies, mailbox writes, disk writes, or external app actions are run.

Verification completed after the approved-action fix:

```bash
node_modules/.bin/vitest run src/test/foundation-command-router.test.ts src/test/foundation-command-lifecycle.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/vite build
node node_modules/@tauri-apps/cli/tauri.js build --bundles app --config '{"build":{"beforeBuildCommand":""}}'
```

Results:

- Targeted router/lifecycle tests passed: 2 files, 30 tests.
- Full test suite passed: 21 files, 105 tests.
- Typecheck passed.
- Frontend production build passed with the existing large-bundle warning only.
- Tauri `.app` bundle build passed with the existing EventKit macOS availability warnings only.
- Installed `/Applications/Adaptive Surface.app` was replaced from the built bundle and ad-hoc signed.
- Installed app passed code-sign verification.
- Signed build and installed app executable hashes matched:
  `6490e8e85b543e299d94b48de9eeb8daf253589b2d8c867c9bc011e1ef4145a1`

Installed app backup:

- `/Applications/Adaptive Surface.app.backup-20260623-074516`

Manual installed-app retests logged in `docs/qa/adaptive-surface-user-stories.xlsx`:

- Rows 49-53: `VJ-04-01-08` Direct, Conversational, Context-rich, Outcome-first, and Guardrail-first prompts all pass as preview-only `Inbox triage action` documents through `email_triage_artifact` with `mode=coordinate_action`.
- All post-fix rows remained safe: no external app opened, no mail was sent, forwarded, archived, deleted, labeled, or modified, no full message bodies were read, and the artifact marked `writesToDisk=false`, `externalWrite=false`, `writesToMailbox=false`, and `fullBodiesRead=false`.

## Status/Exception Follow-Up

Follow-up fix: status and exception tracking artifact for inbox triage.

Pre-fix manual installed-app rows:

- Rows 54-55 and 57: direct, conversational, and outcome-first status/exception prompts failed by routing to `Recent emails` through `load_mail_messages`.
- Row 56: context-rich wording partially improved by routing to an `Inbox triage records` artifact, but still failed because it did not produce thresholds, status, trends, exceptions, stale-data caveats, or follow-up requirements.
- Row 58: guardrail-first wording partially improved by staying preview-only, but failed by routing to `Inbox triage action` with `mode=coordinate_action` instead of status tracking.
- All pre-fix rows remained safe: no external app opened, no mailbox writes occurred, and no full message bodies were read.

Changed behavior:

- Track, progress, risks, exceptions, status, signal, threshold, trend, follow-up, stale, noise, alert, and remediation wording now routes to `create_email_triage_artifact` with `mode=track_status`.
- Status artifacts now display as `Inbox triage status`.
- The artifact explicitly states that the status pass is metadata-only, names Apple Mail metadata as the authoritative signal, reports freshness and evidence limits, sets unread/evidence/action thresholds, lists emerging exceptions, and defines trend/follow-up/stale/noise handling.
- The guardrail-first status prompt now stays in `track_status` instead of being captured by the generic action-coordination mode.
- The local app remains metadata-only for broad status prompts: no full message bodies, mailbox writes, disk writes, or external app actions are run.

Verification completed after the status/exception fix:

```bash
node_modules/.bin/vitest run src/test/foundation-command-router.test.ts src/test/foundation-command-lifecycle.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/vite build
node node_modules/@tauri-apps/cli/tauri.js build --bundles app --config '{"build":{"beforeBuildCommand":""}}'
```

Results:

- Targeted router/lifecycle tests passed: 2 files, 31 tests.
- Typecheck passed.
- Full test suite passed: 21 files, 106 tests.
- Frontend production build passed with the existing large-bundle warning only.
- Tauri `.app` bundle build passed with the existing EventKit macOS availability warnings only.
- Installed `/Applications/Adaptive Surface.app` was replaced from the built bundle and ad-hoc signed.
- Installed app passed code-sign verification.
- Signed build and installed app executable hashes matched:
  `162f4766b0dec0e4cbf80fa1c4e8bef1f3d74a9f3ab6f93d935f5ae06f34c5b0`

Installed app backup:

- `/Applications/Adaptive Surface.app.backup-20260623-075745`

Manual installed-app retests logged in `docs/qa/adaptive-surface-user-stories.xlsx`:

- Rows 59-63: `VJ-04-01-09` Direct, Conversational, Context-rich, Outcome-first, and Guardrail-first prompts all pass as read-only `Inbox triage status` documents through `email_triage_artifact` with `mode=track_status`.
- All post-fix rows remained safe: no external app opened, no mail was sent, forwarded, archived, deleted, labeled, or modified, no full message bodies were read, and the artifact marked `writesToDisk=false`, `externalWrite=false`, `writesToMailbox=false`, and `fullBodiesRead=false`.

Remaining work:

- Continue `VJ-04-01-10`, starting with `Close the work and capture lessons for inbox triage.`
- Continue the remaining Email domain queue after the inbox-triage status/exception family.
- Verify DeepSeek-backed behavior on prompt families that actually require model synthesis rather than deterministic local routing.
