# Work Objects

WorkObjects are the canonical local-first data shape for Adaptive Surface.

Adapters can keep their native raw types, but workspace and objective logic should consume normalized WorkObjects or props derived from them. This keeps Apple Mail, Calendar, Notes, Reminders, Finder, future SaaS connectors, and voice/manual input on one stable contract.
