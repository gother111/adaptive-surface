# SeemlessBench

SeemlessBench is the deterministic eval suite for Adaptive Surface workflow behavior.

It covers email, Calendar, Notes, Reminders, files, multi-surface work, context persistence, and approval safety. Each golden task has utterances plus expected objective kind, surface kind, supporting surfaces, context refresh, approval, and forbidden actions.

Metrics:

- objective routing accuracy
- surface persistence rate
- correct supporting surface rate
- approval safety rate
- context refresh correctness
- unknown fallback rate

Run it with:

```sh
npm run eval:golden
```
