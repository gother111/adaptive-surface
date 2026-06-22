import type { LucideIcon } from "lucide-react";
import type { SurfaceBlueprint } from "@/surface-engine/blueprint";

export type SurfaceKind =
  | "brief"
  | "canvas"
  | "decision"
  | "approval"
  | "settings"
  | "summary"
  | "note"
  | "research"
  | "catch_up"
  | "comparison"
  | "email_draft"
  | "calendar"
  | "mail"
  | "notes";

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

export type ContextSourceId =
  | "local-files"
  | "apple-calendar"
  | "apple-reminders"
  | "apple-notes"
  | "apple-mail"
  | "email-account"
  | "github"
  | "slack"
  | "chatgpt-history";

export type ContextAccessMode = "disabled" | "read" | "approval";

export type ContextBridge =
  | "tauri-fs"
  | "applescript-read"
  | "mail-connector"
  | "oauth-api"
  | "manual-import";

export type ContextSourceStatus =
  | "ready"
  | "needs-permission"
  | "needs-auth"
  | "needs-oauth-config"
  | "needs-path"
  | "planned";

export type ContextWritePolicy = "read-only" | "drafts-allowed" | "full-write";

export interface ContextSourceConfig {
  id: ContextSourceId;
  label: string;
  description: string;
  accessMode: ContextAccessMode;
  bridge: ContextBridge;
  status: ContextSourceStatus;
  writePolicy: ContextWritePolicy;
  userValue?: string;
  detail?: string;
}

export interface SurfaceConfig {
  id: string;
  kind: SurfaceKind;
  title: string;
  subtitle: string;
  blueprint?: SurfaceBlueprint;
  streamStatus?: StreamStatus;
  liveTranscript?: string;
  topic?: string;
  confidence?: number;
  sections?: Array<{
    id: string;
    title: string;
    items: string[];
  }>;
  briefBlocks?: BriefBlock[];
  decisionOptions?: DecisionOption[];
  approvalActions?: ApprovalAction[];
}

export interface IntegrationSettings {
  appleScriptEnabled: boolean;
  accessibilityEnabled: boolean;
  localBackendUrl: string;
  selectedModel: string;
  modelIntentRoutingEnabled: boolean;
  voiceMode: "push-to-talk" | "continuous";
  trustedFileRoots: string[];
  personalFileIndexPath: string;
  contextSources: ContextSourceConfig[];
}
