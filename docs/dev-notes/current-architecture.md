# Current Architecture

## Voice pipeline

`src/voice/useRealtimeDictation.ts` sends partial and final transcripts into `src/stores/useSurfaceStore.ts`. Partial transcripts update live caption and intent/debug state only. Final transcripts call the deterministic workspace router in `src/workspace/voice-router.ts`, convert the route into `WorkspacePatch` values, and apply them through `src/workspace/workspace-reducer.ts`.

## Workspace session and patches

`workspaceSession` is the durable render model for the voice workspace. `workspacePatches` records recent `CREATE_SURFACE`, `UPDATE_SURFACE`, `SET_PRIMARY_SURFACE`, `STORE_CONTEXT_RESULT`, and transcript patches for debugging. The reducer upserts surfaces instead of replacing the whole workspace, which keeps an email draft open while supporting panels are added.

## Local Apple context flow

`src/lib/context-api.ts` calls Tauri commands for Apple Calendar, Apple Mail, Apple Notes, and Apple Reminders. The Rust side lives under `src-tauri/src/apple/*` and returns an `AppleContextBundle`. Reminders use an EventKit-backed provider for list, create, and update flows without opening the Reminders app. File-directory context is available through `load_local_context_preview` and respects trusted roots.

## Surface rendering flow

`src/components/workspace/WorkspaceStage.tsx` renders the primary surface and supporting panels from `workspaceSession.surfaces`. The blueprint engine in `src/surface-engine/*` still exists for controlled component rendering, but the voice workspace currently uses typed workspace surface props for email, Calendar, Mail, Notes, Reminders preview, files, tables, and charts.

## Current weaknesses

- Voice routing was surface-first, not objective-first.
- Local app data stayed in app-specific raw shapes instead of canonical WorkObjects.
- Approval policy was visual but not enforced by a typed capability registry.
- No deterministic golden eval suite existed for routing, persistence, context refresh, or approval safety.
- File summarization beyond supported text previews is not backed by a full document parser yet.

## No-regression areas

- Partial transcripts must not destructively create or replace surfaces.
- Existing email draft behavior must remain stable across continuation and refinement.
- Calendar, Mail, and Notes context loading must continue through the existing Tauri commands.
- Workspace patches remain the rendering bridge; objectives sit above them.
