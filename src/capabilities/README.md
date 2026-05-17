# Capability Registry

Capabilities are the safe action boundary for Adaptive Surface.

Reads can run once local permission exists. Local writes should preview or lightly confirm. External writes and destructive actions require explicit approval. Missing adapters return structured `not_implemented` results instead of crashing.
