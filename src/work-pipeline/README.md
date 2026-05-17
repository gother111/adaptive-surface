# Work Data Pipeline

Raw local context is normalized into WorkObjects, scored against the active ObjectiveFrame, attached to the objective, then rendered through the existing workspace patch flow.

The pipeline deliberately stays deterministic in V1 so voice behavior can be tested with golden tasks.
