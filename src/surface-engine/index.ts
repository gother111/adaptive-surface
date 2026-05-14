export type {
  SurfaceAction,
  SurfaceBlueprint,
  SurfaceComponentPropsMap,
  SurfaceComponentType,
  SurfaceContext,
  SurfaceLayout,
  SurfaceMode,
  SurfaceNode,
  SurfaceNodePriority,
  SurfaceNodeStatus,
} from "@/surface-engine/blueprint";
export type { SurfacePatch, SurfacePatchEnvelope } from "@/surface-engine/patch-types";
export { applySurfacePatch, applySurfacePatches } from "@/surface-engine/patch-reducer";
export { SurfaceRuntime } from "@/surface-engine/surface-runtime";
export {
  createApprovalFlowBlueprint,
  createCatchUpBlueprint,
  createComparisonBlueprint,
  createDecisionBriefBlueprint,
  createNoteBlueprint,
  createResearchWorkspaceBlueprint,
  demoComparisonBlueprint,
} from "@/surface-engine/surface-presets";
export { isKnownComponentType, isSurfaceBlueprint, isSurfacePatch, sanitizeSurfacePatch } from "@/surface-engine/validation";
