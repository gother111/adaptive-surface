export type {
  SurfaceAction,
  SurfaceBlueprint,
  SurfaceComponentPropsMap,
  SurfaceComponentType,
  SurfaceContext,
  ContextSourceKind,
  SurfaceDataBinding,
  SurfaceGeometry,
  SurfaceInteraction,
  SurfaceLayout,
  SurfaceMode,
  SurfaceNode,
  SurfaceNodePriority,
  SurfaceNodeRole,
  SurfaceNodeStatus,
  SurfaceVisibility,
} from "@/surface-engine/blueprint";
export type { SurfacePatch, SurfacePatchEnvelope } from "@/surface-engine/patch-types";
export { applySurfacePatch, applySurfacePatches } from "@/surface-engine/patch-reducer";
export { SurfaceRuntime } from "@/surface-engine/surface-runtime";
export { createCalendarContextNode, createEmailDraftBlueprint } from "@/surface-engine/email-draft-preset";
export {
  createApprovalFlowBlueprint,
  createCatchUpBlueprint,
  createComparisonBlueprint,
  createDecisionBriefBlueprint,
  createNoteBlueprint,
  createResearchWorkspaceBlueprint,
  demoComparisonBlueprint,
} from "@/surface-engine/surface-presets";
export type { ResolvedSurfaceTarget, SurfaceTargetSelector } from "@/surface-engine/targeting";
export { flattenSurfaceNodes, resolveSurfaceNodeTarget } from "@/surface-engine/targeting";
export { isKnownComponentType, isSurfaceBlueprint, isSurfacePatch, sanitizeSurfacePatch } from "@/surface-engine/validation";
