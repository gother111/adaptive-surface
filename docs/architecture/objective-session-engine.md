# Objective Session Engine

ObjectiveFrames are persistent task frames above surfaces.

The core rule is that an active objective is not destroyed or replaced unless the user explicitly switches, closes, completes, or starts a new task. Voice utterances are routed as continuation, refinement, added context, new objective, switch, completion, approval request, or unknown.

Surfaces still update through workspace patches. The objective engine decides task continuity and context needs; the existing workspace reducer decides what appears on screen.

This separation keeps Adaptive Surface from becoming LLM UI generation. The app evolves persistent task state, links work objects, and updates controlled surfaces.
