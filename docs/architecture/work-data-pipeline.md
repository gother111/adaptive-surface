# Work Data Pipeline

Adaptive Surface normalizes local app and file data into WorkObjects before objective logic consumes it.

Raw Apple Mail, Calendar, Notes, Reminders, Finder, and trusted-directory data each keep their native adapter shape at the boundary. After ingestion, `src/work-objects/*` converts them into canonical WorkObjects with kind, source, title, preview, raw reference, confidence, timestamps, and metadata.

Objectives use `scoreObjectRelevanceToObjective` to rank context deterministically. This lets the UI show relevant context for the active objective instead of raw app lists only.

Future SaaS integrations should map into the same WorkObject contract, not bypass it.
