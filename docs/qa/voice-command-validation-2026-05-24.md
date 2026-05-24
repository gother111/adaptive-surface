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
