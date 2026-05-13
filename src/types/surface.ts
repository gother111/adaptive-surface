import type { LucideIcon } from "lucide-react";

export type SurfaceKind = "brief" | "canvas" | "decision" | "approval" | "settings";

export type StreamStatus = "idle" | "thinking" | "streaming" | "complete" | "error";

export interface SurfaceMeta {
  id: string;
  title: string;
  description: string;
  kind: SurfaceKind;
  icon?: LucideIcon;
}

export interface BriefBlock {
  id: string;
  title: string;
  body: string;
  status?: "fresh" | "watching" | "blocked";
}

export interface DecisionOption {
  id: string;
  label: string;
  confidence: number;
  tradeoff: string;
}

export interface ApprovalAction {
  id: string;
  label: string;
  target: string;
  risk: "low" | "medium" | "high";
}

export interface SurfaceConfig {
  id: string;
  kind: SurfaceKind;
  title: string;
  subtitle: string;
  streamStatus?: StreamStatus;
  briefBlocks?: BriefBlock[];
  decisionOptions?: DecisionOption[];
  approvalActions?: ApprovalAction[];
}

export interface IntegrationSettings {
  appleScriptEnabled: boolean;
  accessibilityEnabled: boolean;
  localBackendUrl: string;
  selectedModel: string;
  voiceMode: "push-to-talk" | "continuous";
}
