import type { SurfaceConfig } from "@/types/surface";
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
      return <AdaptiveSurface config={config} />;
    default:
      return null;
  }
}
