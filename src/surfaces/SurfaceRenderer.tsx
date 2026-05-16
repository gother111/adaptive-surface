import type { SurfaceConfig } from "@/types/surface";
import { SurfaceRuntime } from "@/surface-engine/surface-runtime";
import { useSurfaceStore } from "@/stores/useSurfaceStore";
import { AdaptiveSurface } from "@/surfaces/adaptive/AdaptiveSurface";
import { ApprovalSurface } from "@/surfaces/approval/ApprovalSurface";
import { BriefSurface } from "@/surfaces/brief/BriefSurface";
import { CanvasSurface } from "@/surfaces/canvas/CanvasSurface";
import { DecisionSurface } from "@/surfaces/decision/DecisionSurface";
import { SettingsSurface } from "@/surfaces/settings/SettingsSurface";

interface SurfaceRendererProps {
  config: SurfaceConfig;
}

export function SurfaceRenderer({ config }: SurfaceRendererProps) {
  const setFocusedNode = useSurfaceStore((state) => state.setFocusedNode);
  const setSelectedNode = useSurfaceStore((state) => state.setSelectedNode);

  if (config.blueprint) {
    return (
      <SurfaceRuntime
        blueprint={config.blueprint}
        surfaceId={config.id}
        onFocusNode={setFocusedNode}
        onSelectNode={setSelectedNode}
      />
    );
  }

  switch (config.kind) {
    case "brief":
      return <BriefSurface config={config} />;
    case "canvas":
      return <CanvasSurface config={config} />;
    case "decision":
      return <DecisionSurface config={config} />;
    case "approval":
      return <ApprovalSurface config={config} />;
    case "settings":
      return <SettingsSurface config={config} />;
    case "summary":
    case "note":
    case "research":
    case "catch_up":
    case "comparison":
    case "email_draft":
      return <AdaptiveSurface config={config} />;
    default:
      return null;
  }
}
