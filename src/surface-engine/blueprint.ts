export type SurfaceMode = "draft" | "streaming" | "stable" | "needs_approval" | "error";

export type SurfaceLayout =
  | { type: "single_column"; density?: "comfortable" | "compact" }
  | { type: "two_pane"; split?: "balanced" | "main_aside" | "aside_main" }
  | { type: "grid"; columns?: 2 | 3 | 4 }
  | { type: "table"; stickyHeader?: boolean }
  | { type: "approval"; emphasis?: "standard" | "high_risk" }
  | { type: "spatial_canvas"; width?: number; height?: number };

export type SurfaceComponentType =
  | "surface_frame"
  | "panel"
  | "two_pane"
  | "section_grid"
  | "insight_card"
  | "status_pill"
  | "confidence_badge"
  | "action_list"
  | "question_queue"
  | "evidence_block"
  | "source_chip"
  | "risk_badge"
  | "decision_option_card"
  | "comparison_table"
  | "decision_matrix"
  | "approval_gate"
  | "loading_skeleton"
  | "empty_state"
  | "voice_correction_chip"
  | "data_binding_chip"
  | "context_source_chip"
  | "email_draft_surface"
  | "email_body"
  | "calendar_context";

export type SurfaceNodeStatus = "idle" | "forming" | "streaming" | "ready" | "blocked" | "error";

export type SurfaceNodePriority = "low" | "normal" | "high" | "critical";

export type SurfaceNodeRole =
  | "primary_work_object"
  | "supporting_context"
  | "source_preview"
  | "control"
  | "annotation"
  | "approval"
  | "ambient_status";

export interface SurfaceGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  zIndex?: number;
  anchor?: "free" | "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center";
}

export interface SurfaceVisibility {
  state: "visible" | "hidden" | "collapsed" | "minimized";
  reason?: string;
}

export interface SurfaceInteraction {
  draggable?: boolean;
  resizable?: boolean;
  selectable?: boolean;
  focusable?: boolean;
  editable?: boolean;
}

export type ContextSourceKind =
  | "local_files"
  | "apple_mail"
  | "apple_notes"
  | "apple_calendar"
  | "apple_reminders"
  | "browser"
  | "web_search"
  | "github"
  | "slack"
  | "manual"
  | "memory";

export interface SurfaceDataBinding {
  id: string;
  source: ContextSourceKind;
  label?: string;
  query?: string;
  selector?: string;
  fields?: string[];
  status: "idle" | "planned" | "loading" | "available" | "needs_permission" | "error";
  refreshPolicy?: "manual" | "on_surface_open" | "live";
  lastUpdatedAt?: number;
  preview?: string;
  error?: string;
}

export interface SurfaceContext {
  transcript?: string;
  topic?: string;
  intent?: string;
  confidence?: number;
  sources?: Array<{
    id: string;
    label: string;
    status?: "planned" | "available" | "needs_permission" | "error";
  }>;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SurfaceAction {
  id: string;
  label: string;
  intent:
    | "refine"
    | "ask_followup"
    | "approve"
    | "reject"
    | "capture"
    | "open_settings"
    | "noop";
  visualOnly?: boolean;
  disabled?: boolean;
  risk?: "low" | "medium" | "high";
}

export interface SurfaceFrameProps {
  eyebrow?: string;
  statusLabel?: string;
}

export interface PanelProps {
  title?: string;
  subtitle?: string;
  tone?: "default" | "muted" | "accent" | "danger";
}

export interface TwoPaneProps {
  leftLabel?: string;
  rightLabel?: string;
  split?: "balanced" | "main_aside" | "aside_main";
}

export interface SectionGridProps {
  columns?: 2 | 3 | 4;
}

export interface InsightCardProps {
  title: string;
  body: string;
  detail?: string;
  tone?: "default" | "positive" | "warning" | "danger";
}

export interface StatusPillProps {
  label: string;
  tone?: "neutral" | "active" | "success" | "warning" | "danger";
}

export interface ConfidenceBadgeProps {
  value: number;
  label?: string;
}

export interface ActionListProps {
  title?: string;
  items: Array<{
    id: string;
    label: string;
    detail?: string;
    disabled?: boolean;
  }>;
}

export interface QuestionQueueProps {
  questions: string[];
}

export interface EvidenceBlockProps {
  title: string;
  body: string;
  source?: string;
}

export interface SourceChipProps {
  label: string;
  status?: "planned" | "available" | "needs_permission";
}

export interface RiskBadgeProps {
  level: "low" | "medium" | "high";
  label?: string;
}

export interface DecisionOptionCardProps {
  label: string;
  confidence?: number;
  tradeoff?: string;
  recommendation?: boolean;
}

export interface ComparisonTableProps {
  criteria: string[];
  options: string[];
  cells?: Record<string, string>;
}

export interface DecisionMatrixProps {
  criteria: string[];
  options: Array<{
    id: string;
    label: string;
    score?: number;
  }>;
}

export interface ApprovalGateProps {
  proposedAction: string;
  target: string;
  risk: "low" | "medium" | "high";
  requiredPermission: string;
}

export interface LoadingSkeletonProps {
  label?: string;
  rows?: number;
}

export interface EmptyStateProps {
  title: string;
  body?: string;
}

export interface VoiceCorrectionChipProps {
  text: string;
}

export interface DataBindingChipProps {
  bindingId?: string;
  source?: ContextSourceKind;
  label?: string;
  status?: SurfaceDataBinding["status"];
  preview?: string;
}

export interface EmailDraftSurfaceProps {
  to?: string;
  subject?: string;
  tone?: "warm" | "direct" | "formal";
}

export interface EmailBodyProps {
  body: string;
  placeholder?: string;
}

export interface CalendarContextProps {
  title: string;
  items: Array<{
    id: string;
    label: string;
    detail?: string;
  }>;
  status?: "mock" | "planned" | "available";
}

export interface SurfaceComponentPropsMap {
  surface_frame: SurfaceFrameProps;
  panel: PanelProps;
  two_pane: TwoPaneProps;
  section_grid: SectionGridProps;
  insight_card: InsightCardProps;
  status_pill: StatusPillProps;
  confidence_badge: ConfidenceBadgeProps;
  action_list: ActionListProps;
  question_queue: QuestionQueueProps;
  evidence_block: EvidenceBlockProps;
  source_chip: SourceChipProps;
  risk_badge: RiskBadgeProps;
  decision_option_card: DecisionOptionCardProps;
  comparison_table: ComparisonTableProps;
  decision_matrix: DecisionMatrixProps;
  approval_gate: ApprovalGateProps;
  loading_skeleton: LoadingSkeletonProps;
  empty_state: EmptyStateProps;
  voice_correction_chip: VoiceCorrectionChipProps;
  data_binding_chip: DataBindingChipProps;
  context_source_chip: DataBindingChipProps;
  email_draft_surface: EmailDraftSurfaceProps;
  email_body: EmailBodyProps;
  calendar_context: CalendarContextProps;
}

export interface SurfaceNode<TType extends SurfaceComponentType = SurfaceComponentType> {
  id: string;
  type: TType;
  props: SurfaceComponentPropsMap[TType];
  name?: string;
  description?: string;
  role?: SurfaceNodeRole;
  tags?: string[];
  semanticText?: string;
  geometry?: SurfaceGeometry;
  visibility?: SurfaceVisibility;
  interaction?: SurfaceInteraction;
  bindings?: SurfaceDataBinding[];
  children?: SurfaceNode[];
  streaming?: boolean;
  status?: SurfaceNodeStatus;
  priority?: SurfaceNodePriority;
}

export interface SurfaceBlueprint {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  mode: SurfaceMode;
  layout: SurfaceLayout;
  components: SurfaceNode[];
  context?: SurfaceContext;
  actions?: SurfaceAction[];
  createdAt: number;
  updatedAt: number;
}
