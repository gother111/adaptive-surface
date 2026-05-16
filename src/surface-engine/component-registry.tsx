import { memo, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  FileQuestion,
  Gauge,
  Link2,
  LockKeyhole,
  Mail,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ActionListProps,
  ApprovalGateProps,
  ComparisonTableProps,
  ConfidenceBadgeProps,
  CalendarContextProps,
  DataBindingChipProps,
  DecisionMatrixProps,
  DecisionOptionCardProps,
  EmailBodyProps,
  EmailDraftSurfaceProps,
  EmptyStateProps,
  EvidenceBlockProps,
  InsightCardProps,
  LoadingSkeletonProps,
  PanelProps,
  QuestionQueueProps,
  RiskBadgeProps,
  SectionGridProps,
  SourceChipProps,
  StatusPillProps,
  SurfaceComponentType,
  SurfaceFrameProps,
  SurfaceNode,
  TwoPaneProps,
  VoiceCorrectionChipProps,
} from "@/surface-engine/blueprint";

export interface SurfaceComponentRenderProps<TType extends SurfaceComponentType = SurfaceComponentType> {
  node: SurfaceNode<TType>;
  children?: ReactNode;
}

type RegistryComponent = (props: SurfaceComponentRenderProps) => ReactNode;

type ComponentRegistry = Record<SurfaceComponentType, RegistryComponent>;

export const surfaceComponentRegistry: ComponentRegistry = {
  surface_frame: SurfaceFrame,
  panel: Panel,
  two_pane: TwoPane,
  section_grid: SectionGrid,
  insight_card: InsightCard,
  status_pill: StatusPill,
  confidence_badge: ConfidenceBadge,
  action_list: ActionList,
  question_queue: QuestionQueue,
  evidence_block: EvidenceBlock,
  source_chip: SourceChip,
  risk_badge: RiskBadge,
  decision_option_card: DecisionOptionCard,
  comparison_table: ComparisonTable,
  decision_matrix: DecisionMatrix,
  approval_gate: ApprovalGate,
  loading_skeleton: LoadingSkeleton,
  empty_state: EmptyState,
  voice_correction_chip: VoiceCorrectionChip,
  data_binding_chip: DataBindingChip,
  context_source_chip: DataBindingChip,
  email_draft_surface: EmailDraftSurface,
  email_body: EmailBody,
  calendar_context: CalendarContext,
};

export function getSurfaceComponent(type: SurfaceComponentType) {
  return surfaceComponentRegistry[type] ?? SafeFallback;
}

export const SafeFallback = memo(function SafeFallback({ node }: SurfaceComponentRenderProps) {
  return (
    <div className="rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <AlertTriangle className="size-4 text-destructive" />
        Unsupported surface component
      </div>
      <p className="mt-2">The app ignored an unapproved component type: {node.type}</p>
    </div>
  );
});

function SurfaceFrame({ node, children }: SurfaceComponentRenderProps) {
  const props = node.props as SurfaceFrameProps;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-7 lg:px-8">
      <div className="glass-panel rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {props.eyebrow ? (
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
                <Sparkles className="size-3.5" />
                {props.eyebrow}
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleDashed className={cn("size-4", node.streaming ? "animate-spin text-primary" : "text-muted-foreground")} />
              {props.statusLabel ?? (node.streaming ? "Building surface" : "Surface ready")}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Panel({ node, children }: SurfaceComponentRenderProps) {
  const props = node.props as PanelProps;

  return (
    <section className={cn("h-full overflow-hidden rounded-lg border p-5", panelToneClass(props.tone), node.streaming && "shadow-[0_0_30px_var(--surface-glow)]")}>
      {(props.title || props.subtitle) && (
        <div className="mb-4">
          {props.title ? <h3 className="text-sm font-semibold text-foreground">{props.title}</h3> : null}
          {props.subtitle ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.subtitle}</p> : null}
        </div>
      )}
      <div className="space-y-4 overflow-hidden">{children}</div>
    </section>
  );
}

function TwoPane({ node, children }: SurfaceComponentRenderProps) {
  const props = node.props as TwoPaneProps;
  const childArray = toChildArray(children);
  const gridClass =
    props.split === "main_aside"
      ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]"
      : props.split === "aside_main"
        ? "lg:grid-cols-[minmax(280px,0.65fr)_minmax(0,1.35fr)]"
        : "lg:grid-cols-2";

  return (
    <div className={cn("grid gap-4", gridClass)}>
      <div className="space-y-4">
        {props.leftLabel ? <PaneLabel>{props.leftLabel}</PaneLabel> : null}
        {childArray.filter((_, index) => index % 2 === 0)}
      </div>
      <div className="space-y-4">
        {props.rightLabel ? <PaneLabel>{props.rightLabel}</PaneLabel> : null}
        {childArray.filter((_, index) => index % 2 === 1)}
      </div>
    </div>
  );
}

function SectionGrid({ node, children }: SurfaceComponentRenderProps) {
  const props = node.props as SectionGridProps;
  const columns = props.columns ?? 2;

  return (
    <div className={cn("grid gap-4", columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
      {children}
    </div>
  );
}

function InsightCard({ node }: SurfaceComponentRenderProps) {
  const props = node.props as InsightCardProps;

  return (
    <article className={cn("rounded-lg border border-white/10 bg-card/70 p-4", insightToneClass(props.tone))}>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold">{props.title}</h4>
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{props.body}</p>
      {props.detail ? <p className="mt-3 text-xs leading-5 text-muted-foreground/80">{props.detail}</p> : null}
    </article>
  );
}

function StatusPill({ node }: SurfaceComponentRenderProps) {
  const props = node.props as StatusPillProps;

  return (
    <Badge variant="secondary" className={cn("w-fit", pillToneClass(props.tone))}>
      {props.label}
    </Badge>
  );
}

function ConfidenceBadge({ node }: SurfaceComponentRenderProps) {
  const props = node.props as ConfidenceBadgeProps;
  const value = Math.max(0, Math.min(100, Math.round(props.value)));

  return (
    <div className="flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">
      <Gauge className="size-3.5 text-primary" />
      <span className="font-medium text-foreground">{value}%</span>
      {props.label ?? "confidence"}
    </div>
  );
}

function ActionList({ node }: SurfaceComponentRenderProps) {
  const props = node.props as ActionListProps;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      {props.title ? <h4 className="text-sm font-semibold">{props.title}</h4> : null}
      <div className="mt-3 space-y-2">
        {props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-card/60 px-3 py-2 text-left text-sm transition hover:border-primary/30 disabled:opacity-50"
          >
            <span>
              <span className="block font-medium">{item.label}</span>
              {item.detail ? <span className="text-xs leading-5 text-muted-foreground">{item.detail}</span> : null}
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionQueue({ node }: SurfaceComponentRenderProps) {
  const props = node.props as QuestionQueueProps;

  return (
    <div className="space-y-2">
      {props.questions.map((question, index) => (
        <div key={`${question}-${index}`} className="flex gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm">
          <FileQuestion className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="leading-6 text-muted-foreground">{question}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceBlock({ node }: SurfaceComponentRenderProps) {
  const props = node.props as EvidenceBlockProps;

  return (
    <article className="rounded-lg border border-white/10 bg-card/70 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Search className="size-4 text-primary" />
        {props.title}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{props.body}</p>
      {props.source ? <div className="mt-3 text-xs text-muted-foreground/80">{props.source}</div> : null}
    </article>
  );
}

function SourceChip({ node }: SurfaceComponentRenderProps) {
  const props = node.props as SourceChipProps;

  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", props.status === "available" ? "bg-primary" : "bg-muted-foreground")} />
      {props.label}
    </span>
  );
}

function DataBindingChip({ node }: SurfaceComponentRenderProps) {
  const props = node.props as DataBindingChipProps;
  const binding = props.bindingId ? node.bindings?.find((item) => item.id === props.bindingId) : node.bindings?.[0];
  const source = props.source ?? binding?.source ?? "manual";
  const status = props.status ?? binding?.status ?? "planned";
  const label = props.label ?? binding?.label ?? source.replace(/_/g, " ");
  const preview = props.preview ?? binding?.preview;

  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs text-muted-foreground">
      <Link2 className="size-3.5 shrink-0 text-primary" />
      <span className="truncate font-medium text-foreground">{label}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5", bindingStatusClass(status))}>
        {status.replace(/_/g, " ")}
      </span>
      {preview ? <span className="hidden max-w-[220px] truncate sm:inline">{preview}</span> : null}
    </div>
  );
}

function EmailDraftSurface({ node, children }: SurfaceComponentRenderProps) {
  const props = node.props as EmailDraftSurfaceProps;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-card/80 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4 text-primary" />
          Email draft
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
            <span className="text-muted-foreground">To</span>
            <span className="truncate text-foreground">{props.to || "Recipient forming..."}</span>
          </div>
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
            <span className="text-muted-foreground">Subject</span>
            <span className="truncate text-foreground">{props.subject || "Available Friday"}</span>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </section>
  );
}

function EmailBody({ node }: SurfaceComponentRenderProps) {
  const props = node.props as EmailBodyProps;
  const body = props.body || props.placeholder || "Start speaking and the email will form here.";

  return (
    <div className="min-h-[260px] whitespace-pre-wrap rounded-lg border border-white/[0.08] bg-white/[0.035] p-5 text-[15px] leading-7 text-foreground">
      {body}
    </div>
  );
}

function CalendarContext({ node }: SurfaceComponentRenderProps) {
  const props = node.props as CalendarContextProps;

  return (
    <aside className="h-full overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.065] p-4 shadow-[0_0_36px_var(--surface-glow)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" />
          {props.title}
        </div>
        <Badge variant="secondary">{props.status ?? "mock"}</Badge>
      </div>
      <div className="mt-4 space-y-3">
        {props.items.map((item) => (
          <div key={item.id} className="rounded-md border border-white/10 bg-background/35 p-3 text-sm">
            <div className="font-medium">{item.label}</div>
            {item.detail ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</div> : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

function RiskBadge({ node }: SurfaceComponentRenderProps) {
  const props = node.props as RiskBadgeProps;

  return (
    <Badge className={cn("w-fit", props.level === "high" ? "bg-destructive text-white" : props.level === "medium" ? "bg-amber-500/20 text-amber-100" : "bg-primary/20 text-primary")}>
      {props.label ?? `${props.level} risk`}
    </Badge>
  );
}

function DecisionOptionCard({ node }: SurfaceComponentRenderProps) {
  const props = node.props as DecisionOptionCardProps;

  return (
    <article className={cn("rounded-lg border bg-card/70 p-4", props.recommendation ? "border-primary/40 shadow-[0_0_30px_var(--surface-glow)]" : "border-white/10")}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{props.label}</h4>
        {props.recommendation ? <Badge className="bg-primary text-primary-foreground">Best current read</Badge> : null}
      </div>
      {typeof props.confidence === "number" ? <div className="mt-3"><ConfidenceBadge node={{ ...node, type: "confidence_badge", props: { value: props.confidence } }} /></div> : null}
      {props.tradeoff ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{props.tradeoff}</p> : null}
    </article>
  );
}

function ComparisonTable({ node }: SurfaceComponentRenderProps) {
  const props = node.props as ComparisonTableProps;
  const options = props.options.length ? props.options.slice(0, 4) : ["Option A", "Option B"];

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-card/70">
      <div
        className="grid border-b border-white/10 bg-white/[0.04] text-sm font-medium"
        style={{ gridTemplateColumns: `minmax(130px, 0.7fr) repeat(${options.length}, minmax(120px, 1fr))` }}
      >
        <div className="p-3 text-muted-foreground">Criteria</div>
        {options.map((option) => (
          <div key={option} className="border-l border-white/10 p-3">{option}</div>
        ))}
      </div>
      {props.criteria.map((criterion) => (
        <div
          key={criterion}
          className="grid border-b border-white/[0.08] last:border-b-0"
          style={{ gridTemplateColumns: `minmax(130px, 0.7fr) repeat(${options.length}, minmax(120px, 1fr))` }}
        >
          <div className="p-3 text-sm font-medium">{criterion}</div>
          {options.map((option, index) => (
            <div key={`${criterion}-${option}`} className="border-l border-white/10 p-3">
              <div className="text-sm leading-6 text-muted-foreground">
                {props.cells?.[`${criterion}:${option}`] ?? <SkeletonLine wide={index % 2 === 0} />}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DecisionMatrix({ node }: SurfaceComponentRenderProps) {
  const props = node.props as DecisionMatrixProps;

  return (
    <div className="space-y-3">
      {props.options.map((option) => (
        <div key={option.id} className="rounded-lg border border-white/10 bg-card/70 p-4">
          <div className="flex items-center justify-between gap-3 text-sm font-medium">
            {option.label}
            {typeof option.score === "number" ? <span className="text-primary">{option.score}/100</span> : <CircleDashed className="size-4 animate-spin text-primary" />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.criteria.map((criterion) => <SourceChip key={criterion} node={{ id: criterion, type: "source_chip", props: { label: criterion, status: "planned" } }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApprovalGate({ node }: SurfaceComponentRenderProps) {
  const props = node.props as ApprovalGateProps;

  return (
    <section className="rounded-lg border border-primary/25 bg-primary/[0.07] p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LockKeyhole className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{props.proposedAction}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{props.target}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <RiskBadge node={{ id: `${node.id}-risk`, type: "risk_badge", props: { level: props.risk } }} />
            <Badge variant="secondary">{props.requiredPermission}</Badge>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" disabled><Check className="size-4" />Approve later</Button>
            <Button size="sm" variant="secondary" disabled>Reject later</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function LoadingSkeleton({ node }: SurfaceComponentRenderProps) {
  const props = node.props as LoadingSkeletonProps;
  const rows = Math.max(1, Math.min(8, props.rows ?? 3));

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      {props.label ? <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><CircleDashed className="size-4 animate-spin text-primary" />{props.label}</div> : null}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonLine key={index} wide={index % 3 !== 1} />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ node }: SurfaceComponentRenderProps) {
  const props = node.props as EmptyStateProps;

  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-5 text-center">
      <ShieldAlert className="mx-auto size-5 text-muted-foreground" />
      <h4 className="mt-3 text-sm font-semibold">{props.title}</h4>
      {props.body ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{props.body}</p> : null}
    </div>
  );
}

function VoiceCorrectionChip({ node }: SurfaceComponentRenderProps) {
  const props = node.props as VoiceCorrectionChipProps;

  return (
    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs text-primary">
      <ArrowRight className="size-3.5" />
      {props.text}
    </div>
  );
}

function PaneLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{children}</div>;
}

function SkeletonLine({ wide }: { wide: boolean }) {
  return <div className={cn("h-2.5 rounded-full bg-primary/25", wide ? "w-4/5" : "w-1/2")} />;
}

function toChildArray(children: ReactNode) {
  return Array.isArray(children) ? children : children ? [children] : [];
}

function panelToneClass(tone: PanelProps["tone"]) {
  if (tone === "accent") return "border-primary/20 bg-primary/[0.06]";
  if (tone === "danger") return "border-destructive/25 bg-destructive/10";
  if (tone === "muted") return "border-white/[0.08] bg-white/[0.035]";
  return "border-white/10 bg-card/70";
}

function insightToneClass(tone: InsightCardProps["tone"]) {
  if (tone === "positive") return "border-primary/25";
  if (tone === "warning") return "border-amber-400/25 bg-amber-400/[0.06]";
  if (tone === "danger") return "border-destructive/25 bg-destructive/10";
  return "";
}

function pillToneClass(tone: StatusPillProps["tone"]) {
  if (tone === "active") return "bg-primary/20 text-primary";
  if (tone === "success") return "bg-emerald-400/15 text-emerald-100";
  if (tone === "warning") return "bg-amber-400/15 text-amber-100";
  if (tone === "danger") return "bg-destructive/20 text-red-100";
  return "";
}

function bindingStatusClass(status: NonNullable<DataBindingChipProps["status"]>) {
  if (status === "available") return "bg-primary/20 text-primary";
  if (status === "needs_permission") return "bg-amber-400/15 text-amber-100";
  if (status === "error") return "bg-destructive/20 text-red-100";
  if (status === "loading") return "bg-white/10 text-foreground";
  return "bg-white/[0.06] text-muted-foreground";
}
