# Voice Command Validation - 2026-05-24

Scope: small MVP slice for sequential voice/typed-command work. This round added source-grounded latest-email analysis and an in-app text artifact generated from that analysis.

## Implementation Under Test

- `show recent emails` loads real Mail metadata and stores `latestEmailId`.
- `summarize the latest email` reads that stored message id, analyzes the message, and displays a source-grounded summary.
- `create a text document from the latest email summary` creates an in-app Markdown document surface from the stored analysis.
- The document is not written to disk and does not send, draft, or create anything in external apps.

## Iteration Log

### Cycle 1 - Router

Command:

```bash
npm test -- src/test/foundation-command-router.test.ts
```

Result: passed, 9 tests.

Judgment: the natural phrases route to the intended adapters:

- `Summarize the latest email` -> `summarize_latest_email`
- `Analyze this email` -> `analyze_mail_message`
- `Create a text document from the latest email summary` -> `create_email_summary_artifact`

### Cycle 2 - Lifecycle And Relevance

Command:

```bash
npm test -- src/test/foundation-command-lifecycle.test.ts
```

Initial result: failed. The analyzer classified an invoice-approval email as generic approval instead of a payment/billing item.

Fix: moved payment/invoice detection ahead of generic approval detection.

Retest result: passed, 6 tests.

Judgment: useful failure. The test caught a relevance problem, not just a code problem. After the fix, an invoice message is judged as payment/billing context and keeps evidence from the source message.

### Cycle 3 - Type Safety And Golden Commands

Commands:

```bash
npm run typecheck
npm test -- src/test/golden-eval.test.ts
```

Initial typecheck result: failed because the Mail test mocks were inferred as never-returning functions.

Fix: typed the Mail mocks as `Promise<AppleMailMessage[]>` and `Promise<AppleMailMessageDetail>`.

Retest result: typecheck passed. Golden eval passed with 37/37 tasks.

Judgment: sequential command behavior held up in the existing eval harness. The new workflow did not break approval safety, context refresh checks, or persistence checks.

### Cycle 4 - Full Unit Suite

Command:

```bash
npm test
```

Result: passed, 12 files and 46 tests.

Judgment: the new commands did not regress existing command routing, objective routing, workspace layout, capability approval, or foundation lifecycle behavior.

### Cycle 5 - Native Compile Check

Command:

```bash
cargo check
```

Result: passed. Existing EventKit deprecation warning remains.

Judgment: no Rust change was required for this slice. Native compile still succeeds.

### Cycle 6 - Desktop UI Attempt

Command:

```bash
npm run tauri:dev
```

Computer Use action: typed `show recent emails` into the visible Adaptive Surface window.

Observed result: the visible window was the installed `/Applications/Adaptive Surface.app` process, not the fresh `target/debug/adaptive-surface` dev process. That installed app showed a Mail timeout after 12 seconds.

Judgment: not valid proof for the new code. It is still a useful operational finding:

- Computer Use can accidentally target the installed app when the dev process shares the same name and bundle id.
- Future UI validation must either install the tested build intentionally, use a uniquely named dev bundle, or verify the visible process path before judging app behavior.
- I stopped the installed process once this mismatch was found, but Computer Use relaunched the installed app when asked for `Adaptive Surface`, so this plugin cannot currently target the dev binary directly.

### Cycle 7 - Direct Mail Metadata Sanity Check

Commands:

```bash
find "$HOME/Library/Mail" -path '*/MailData/Envelope Index' -type f
/usr/bin/sqlite3 -readonly "$mail_index" "select count(*) from messages;"
/usr/bin/sqlite3 -readonly -separator $'\037' "$mail_index" "select ... order by m.date_received desc limit 25;"
```

Result: the local Mail Envelope Index was readable from the shell. The count query returned 31,738 messages, and the recent-message query returned 25 rows quickly.

Judgment: the underlying local Mail metadata exists and can be queried. The installed app timeout should not be treated as proof that the new code cannot read Mail; it is a stale-build/runtime-targeting issue until reproduced in the tested dev build or an installed fresh build.

## Result Validation Notes

- The email analysis is source-grounded and deterministic. It uses subject, sender, received date, body, preview, requested-action signals, and evidence snippets.
- The analyzer deliberately exposes evidence so the user can judge whether the result is relevant to the command.
- The generated document includes source metadata and `writesToDisk: false`.
- The workflow refuses to summarize if no latest email has been loaded first.
- The workflow refuses to create the document if no latest email analysis exists first.

## Remaining Risks

- This is not a general LLM summarizer. It is a deterministic first pass that avoids hallucination but cannot deeply reason over long or messy threads yet.
- Desktop UI validation through Computer Use is blocked by app-target ambiguity between the installed app and the dev binary.
- Actual voice recognition was not validated in this round; typed commands validate the same post-transcription command path.
- Real Mail body extraction from `.emlx` still needs dev-build or fresh-install validation before claiming full end-to-end success.

## Next Validation Step

Create a uniquely named dev/test bundle, or intentionally install the tested build, then rerun this exact sequence through the visible app:

1. `show recent emails`
2. Verify the displayed first message against the Mail provider result.
3. `summarize the latest email`
4. Verify the summary uses only the displayed/loaded email.
5. `create a text document from the latest email summary`
6. Verify the document body preserves source metadata and does not write externally.

## Follow-Up Installed-App Validation

After the initial commit, the tested release bundle was built with:

```bash
npm run tauri:app
```

The bundle was installed into `/Applications/Adaptive Surface.app`, launched, and verified by comparing the SHA-256 hash of:

- `/Applications/Adaptive Surface.app/Contents/MacOS/adaptive-surface`
- `src-tauri/target/release/bundle/macos/Adaptive Surface.app/Contents/MacOS/adaptive-surface`

The hashes matched, so Computer Use was testing the current installed app rather than a stale app.

### Installed-App Findings

1. `show capability status`
   - Result: passed.
   - Displayed: `Capability status`, `available`, `External app opened: no`, and the expected local/source cards.
   - Judgment: relevant and accurate for a diagnostics command.

2. `show recent emails`
   - Initial result after install: failed by timeout.
   - Displayed: `provider=load_mail_messages errorKind=timeout`.
   - Root cause: the Apple Mail fallback list script read message bodies while listing messages, which made a simple list command too slow.
   - Fix: list fallback now loads metadata only and instructs the user to open the latest email fully when body text is needed.

3. `show recent emails` after fix and reinstall
   - Result: passed.
   - Displayed: `Recent emails`, `available`, `25 real Apple Mail messages loaded`.
   - Visible first message: `[Task Update] Daily Command Center` from `ChatGPT <noreply@tm.openai.com>`.
   - Judgment: relevant and accurate. It showed real local Mail metadata without opening another app.

4. `summarize the latest email`
   - Result: passed mechanically.
   - Displayed: source, sender, received date, requested action, relevance judgment, evidence, and Markdown body.
   - Quality judgment: source-grounded but still rough. It correctly avoided inventing an action, but the email body contains newsletter/footer boilerplate and non-text glyphs, so the summary is cluttered. This is acceptable as a first safety-preserving pass, not a polished LLM-quality summary.

5. `create a text document from the latest email summary`
   - Result: passed.
   - Displayed: `Email analysis document`, `artifactType text/markdown`, `writesToDisk false`.
   - Judgment: relevant and safe. It created an in-app artifact only, with source metadata preserved and no external write.

### Iteration Fixes From Installed-App Testing

- Fixed Mail list fallback to avoid body reads in `mail_script`.
- Added Rust regression coverage proving the list fallback script does not contain `content of msg as text`.
- Fixed the foundation router so `go back to the email` and `return to the reply draft` are not misrouted into unsupported local-context handling. Those phrases now fall through to workspace focus logic.

## 20-Workflow Sequential Audit

Added `src/test/voice-workflow-quality-audit.test.ts`.

The audit runs 20 workflows. Each workflow contains at least 5 sequential prompts. The scenarios cover:

- email analysis and artifact creation
- full email read followed by analysis
- email draft continuation and refinement
- email draft plus calendar context
- notes and mail context switching
- calendar prep
- reminders and approval safety
- local file search and file detail
- connector honesty for Gmail and Google Drive
- contacts to email drafting
- unsupported command recovery
- artifact persistence while switching context

Validation criteria:

- every scenario executes all prompts in order
- no adapter or permission error surfaces are produced in the controlled audit
- expected primary surface is preserved
- expected supporting surfaces are present
- generated email documents include source metadata, requested action, relevance judgment, and `writesToDisk false`
- email analysis stays grounded in the fixture body and evidence

Audit result:

```bash
npm test -- src/test/voice-workflow-quality-audit.test.ts
```

Passed after one real routing fix and two expectation corrections. The real fix was the `go back to the email` routing issue; the expectation corrections were about diagnostics staying supporting instead of stealing the primary surface.

## Five Additional Daily Workflow Cycles

Added `src/test/daily-voice-workflow-cycles.test.ts`.

Each cycle was run red first, then fixed, then re-run green:

1. Morning briefing
   - Prompt chain: `give me a morning briefing`, `show recent emails`, `show today's calendar`, `show reminders`, `go back to the briefing`.
   - Initial result: failed. The app had no true briefing command and ended on reminders.
   - Fix: added `show_daily_briefing`, which creates an in-app Markdown brief from Mail, Calendar, and Reminders with `writesToDisk false`.

2. Bills and payments
   - Prompt chain: `what bills or payments need attention`, `show recent emails`, `show reminders`, `go back to the payment list`, `summarize the latest email`.
   - Initial result: failed. Payment language fell into unsupported local context.
   - Fix: added `show_payment_items`, which filters Mail and Reminders for bill/payment/invoice signals and displays a source-labeled in-app artifact.

3. Meeting preparation
   - Prompt chain: `prep me for my next meeting`, `show recent notes`, `open the latest note`, `go back to the meeting prep`, `make a table from it`.
   - Initial result: failed. The app degraded into raw notes/calendar context instead of preserving a meeting-prep output.
   - Fix: added `prepare_next_meeting`, which creates a meeting-prep artifact from Calendar and Notes, and added focus handling for `meeting prep`.

4. Natural due-today language
   - Prompt chain: `what's due today`, `what do I need to do today`, `show recent emails`, `go back to reminders`, `show capability status`.
   - Initial result: failed. `what do I need to do today` produced an unsupported-context surface.
   - Fix: expanded reminder routing for natural task language such as `what's due today` and `what do I need to do today`.

5. Cancel pending approval
   - Prompt chain: `create a reminder to call the dentist tomorrow morning`, `cancel that`, `approve`, `show reminders`, `what's due today`.
   - Initial result: failed. The pending approval was cleared, but the cancellation was not visibly preserved and the UX did not prove the later approve was harmless.
   - Fix: added `cancel_pending_action`; it clears the pending write, leaves a visible canceled approval surface, and a later `approve` returns `No pending approval` instead of creating anything.

Regression found during broad verification:

- Adding `meeting` as a local-context word initially caused `include the first meeting` inside an email draft to become unsupported context. Fixed by letting draft follow-up verbs such as `mention`, `include`, `add`, `tell`, and `say` fall through to the workspace draft router.
- The golden eval expectation for `Prepare meeting with notes` was updated from raw `calendar_day` to `document`, because the improved behavior now creates a meeting-prep artifact while still refreshing Apple context.

## Final Verification Bundle

Commands run after all fixes:

```bash
npm test
npm run typecheck
npm run eval:golden
cargo test mail_list_fallback_does_not_read_message_bodies
cargo check
```

Results:

- `npm test`: passed, 13 files and 48 tests.
- `npm run typecheck`: passed.
- `npm run eval:golden`: passed, 37/37 tasks.
- `cargo test mail_list_fallback_does_not_read_message_bodies`: passed.
- `cargo check`: passed with the existing EventKit deprecation warning.

Additional verification after the five daily workflow cycles:

```bash
npm test
npm run typecheck
npm run eval:golden
cargo test mail_list_fallback_does_not_read_message_bodies
cargo check
```

Results:

- `npm test`: passed, 14 files and 55 tests.
- `npm run typecheck`: passed.
- `npm run eval:golden`: passed, 37/37 tasks.
- `cargo test mail_list_fallback_does_not_read_message_bodies`: passed.
- `cargo check`: passed with the existing EventKit deprecation warning.

Remaining quality gaps:

- The analyzer is deterministic and safe, but not yet a true high-quality LLM summarizer.
- Real voice audio was not stress-tested for 100 spoken utterances; the typed command bar validates the same post-transcription path.
- Mail body cleanup needs improvement to strip boilerplate, tracking glyphs, and legal footers before summarization.
- Installed-app testing confirmed the core Mail workflow works, but the 20-workflow audit is automated with controlled fixture data rather than 100 manual UI interactions.
