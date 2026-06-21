# Surface Recipes and Patches

Surface recipes describe frontend presentation. They do not replace backend domain objects or authorize OS actions.

## Recipe Contract

Each recipe contains:

- `sessionId`
- `recipeId`
- `revision`
- `mode`
- `archetype`
- typed `nodes`
- optional primary action

Nodes carry zone hints, priority, disclosure level, persistence, placement constraints, artifact references, and accessibility labels.

## Patch Contract

Patches are transactional and revision-bound. Supported operations are:

- upsert node
- update node
- set disclosure
- move node
- collapse node
- remove node

Unknown renderer/component code is not accepted through this layer.

## Safety Policy

If a patch is stale, structural, or conflicts with local presentation protection, it is deferred instead of moving or removing user-touched objects.
