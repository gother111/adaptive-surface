import type { SurfaceKind } from "@/types/surface";

export type IntentKind =
  | "create_brief"
  | "open_canvas"
  | "summarize_content"
  | "decision_help"
  | "quick_note"
  | "research_mode"
  | "catch_up"
  | "comparison_table"
  | "approval_flow"
  | "freeform_canvas"
  | "show_calendar"
  | "show_mail"
  | "show_notes";

export interface IntentDetection {
  intent: IntentKind;
  confidence: number;
  surfaceKind: SurfaceKind;
  title: string;
  topic: string;
  slots: {
    entities: string[];
    actionWords: string[];
    correction?: boolean;
  };
  rationale: string;
}

export interface IntentCandidate {
  intent: IntentKind;
  surfaceKind: SurfaceKind;
  title: string;
  keywords: string[];
  actionWords: string[];
  rationale: string;
}
