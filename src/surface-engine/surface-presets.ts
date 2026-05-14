import type { SurfaceBlueprint, SurfaceNode } from "@/surface-engine/blueprint";

export interface SurfacePresetInput {
  id?: string;
  kind?: string;
  title?: string;
  subtitle?: string;
  transcript?: string;
  topic?: string;
  intent?: string;
  confidence?: number;
  entities?: string[];
  correction?: boolean;
}

export function createDecisionBriefBlueprint(input: SurfacePresetInput): SurfaceBlueprint {
  const id = input.id ?? "voice-brief";
  const topic = cleanTopic(input.topic ?? input.title ?? "Decision Brief");

  return baseBlueprint(input, {
    id,
    kind: "brief",
    title: titleWithSuffix(topic, "Brief"),
    subtitle: input.subtitle,
    components: [
      frame(id, "Decision brief forming", [
        sectionGrid(`${id}-grid`, [
          panel(`${id}-context`, "Context", "What the app knows so far", [
            insight(`${id}-context-card`, "Initial context", sentenceOrSkeleton(input.transcript), "default"),
            confidence(`${id}-confidence`, input.confidence),
          ]),
          panel(`${id}-options`, "Options", "Candidates will fill as speech clarifies", [
            decisionOption(`${id}-option-a`, "Option A", "Waiting for the first viable path.", 45),
            decisionOption(`${id}-option-b`, "Option B", "Listening for alternatives and constraints.", 35),
          ]),
          panel(`${id}-recommendation`, "Recommendation", "Progressively enriched by typed patches", [
            insight(`${id}-recommendation-card`, "Current recommendation", "Hold as draft until enough context arrives.", "positive"),
          ]),
          panel(`${id}-risks`, "Risks and unknowns", "Kept visible before approval", [
            actionList(`${id}-risk-list`, "Open questions", [
              { id: "audience", label: "Clarify audience" },
              { id: "deadline", label: "Clarify deadline" },
              { id: "risk", label: "Clarify downside risk" },
            ]),
          ]),
        ]),
      ]),
    ],
  });
}

export function createComparisonBlueprint(input: SurfacePresetInput): SurfaceBlueprint {
  const id = input.id ?? "voice-comparison";
  const options = detectOptions(input);

  return baseBlueprint(input, {
    id,
    kind: "comparison",
    title: input.title ?? "Comparison Table",
    subtitle: input.subtitle,
    components: [
      frame(id, "Comparison skeleton ready", [
        panel(`${id}-table-panel`, "Comparison matrix", "Deterministic structure now, enriched cells next", [
          comparisonTable(`${id}-table`, ["Cost", "Speed", "Risk", "Fit"], options),
        ], "accent"),
        sectionGrid(`${id}-supporting-grid`, [
          panel(`${id}-criteria`, "Criteria placeholder", "Refine what matters before ranking", [
            actionList(`${id}-criteria-actions`, "Refinement actions", [
              { id: "add-criteria", label: "Add missing criteria", detail: "Visual only for this milestone" },
              { id: "normalize", label: "Normalize option names" },
              { id: "ask", label: "Ask one follow-up question" },
            ]),
          ]),
          panel(`${id}-loading`, "LLM enrichment queue", "Patches can fill evidence, cells, and recommendation", [
            loading(`${id}-cell-loader`, "Waiting for typed comparison patches", 4),
          ]),
        ]),
      ]),
    ],
  });
}

export function createResearchWorkspaceBlueprint(input: SurfacePresetInput): SurfaceBlueprint {
  const id = input.id ?? "voice-research";
  const topic = cleanTopic(input.topic ?? "Research workspace");

  return baseBlueprint(input, {
    id,
    kind: "research",
    title: input.title ?? "Research Workspace",
    subtitle: input.subtitle,
    components: [
      frame(id, "Research workspace forming", [
        twoPane(`${id}-panes`, [
          panel(`${id}-questions`, "Questions forming", topic, [
            questionQueue(`${id}-question-queue`, [
              `What is the core question behind ${topic}?`,
              "Which sources are trustworthy enough to use?",
              "What would change the recommendation?",
            ]),
          ]),
          panel(`${id}-source-plan`, "Source plan", "Local-first and permission-aware", [
            sourceChip(`${id}-local-notes`, "Local notes", "planned"),
            sourceChip(`${id}-docs`, "Documents", "planned"),
            sourceChip(`${id}-web`, "Web/source connector later", "needs_permission"),
          ]),
          panel(`${id}-evidence`, "Evidence board", "Evidence blocks arrive as validated patches", [
            evidence(`${id}-evidence-placeholder`, "Evidence placeholder", "No source has been read yet. This surface is ready to receive evidence blocks."),
          ]),
          panel(`${id}-synthesis`, "Notes and synthesis", "Keep the working answer visible", [
            loading(`${id}-synthesis-loading`, "Draft synthesis forming", 3),
          ]),
        ], "balanced"),
      ]),
    ],
  });
}

export function createCatchUpBlueprint(input: SurfacePresetInput): SurfaceBlueprint {
  const id = input.id ?? "voice-catch-up";

  return baseBlueprint(input, {
    id,
    kind: "catch_up",
    title: input.title ?? "Catch-up Brief",
    subtitle: input.subtitle,
    components: [
      frame(id, "Catch-up brief forming", [
        sectionGrid(`${id}-grid`, [
          panel(`${id}-changes`, "What changed", "Recent signals will land here", [loading(`${id}-changes-loading`, "Scanning scope from speech", 3)]),
          panel(`${id}-open-loops`, "Open loops", "Items needing attention", [
            actionList(`${id}-loops-list`, undefined, [
              { id: "blocked", label: "Blocked items" },
              { id: "waiting", label: "Waiting on others" },
              { id: "next", label: "Recommended next step" },
            ]),
          ]),
        ]),
      ]),
    ],
  });
}

export function createApprovalFlowBlueprint(input: SurfacePresetInput): SurfaceBlueprint {
  const id = input.id ?? "voice-approval";

  return baseBlueprint(input, {
    id,
    kind: "approval",
    title: input.title ?? "Approval Flow",
    subtitle: input.subtitle,
    mode: "needs_approval",
    components: [
      frame(id, "Approval gate ready", [
        panel(`${id}-proposal`, "Proposed action", "No external write is wired in this milestone", [
          approvalGate(`${id}-gate`, "Review proposed action", sentenceOrSkeleton(input.transcript), "medium", "Explicit user approval"),
        ], "accent"),
        sectionGrid(`${id}-approval-grid`, [
          panel(`${id}-risk`, "Risk", "Visible before any future action", [risk(`${id}-risk-badge`, "medium")]),
          panel(`${id}-permission`, "Required permission", "External actions remain out of scope", [
            insight(`${id}-permission-note`, "Permission boundary", "This is a visual approval surface only. No AppleScript, email, calendar, or external write is executed.", "warning"),
          ]),
        ]),
      ]),
    ],
  });
}

export function createNoteBlueprint(input: SurfacePresetInput): SurfaceBlueprint {
  const id = input.id ?? "voice-note";

  return baseBlueprint(input, {
    id,
    kind: input.kind ?? "note",
    title: input.title ?? "Quick Note",
    subtitle: input.subtitle,
    components: [
      frame(id, "Note surface ready", [
        panel(`${id}-capture`, "Captured thought", "Low-latency working memory", [
          insight(`${id}-note-card`, "Live capture", sentenceOrSkeleton(input.transcript), "default"),
          input.correction ? correction(`${id}-correction`, "Correction detected") : status(`${id}-status`, "listening", "active"),
        ]),
        panel(`${id}-next`, "Likely follow-up", "Future patches can promote this into actions", [
          actionList(`${id}-followups`, undefined, [
            { id: "owner", label: "Clarify owner" },
            { id: "deadline", label: "Clarify deadline" },
            { id: "convert", label: "Convert to action" },
          ]),
        ], "muted"),
      ]),
    ],
  });
}

export const demoComparisonBlueprint = createComparisonBlueprint({
  id: "demo-comparison-blueprint",
  title: "Surface Engine Demo",
  subtitle: "Internal fixture for validating blueprint rendering and patch updates.",
  transcript: "Compare local-first desktop, browser app, and cloud dashboard",
  entities: ["local-first desktop", "browser app", "cloud dashboard"],
  confidence: 0.82,
});

function baseBlueprint(
  input: SurfacePresetInput,
  blueprint: Omit<SurfaceBlueprint, "context" | "actions" | "createdAt" | "updatedAt" | "layout" | "mode"> &
    Partial<Pick<SurfaceBlueprint, "layout" | "mode">>,
): SurfaceBlueprint {
  const now = Date.now();

  return {
    ...blueprint,
    mode: blueprint.mode ?? "streaming",
    layout: blueprint.layout ?? { type: "single_column", density: "comfortable" },
    context: {
      transcript: input.transcript,
      topic: input.topic,
      intent: input.intent,
      confidence: input.confidence,
    },
    actions: [
      { id: "refine", label: "Refine surface", intent: "refine", visualOnly: true },
      { id: "ask-followup", label: "Ask follow-up", intent: "ask_followup", visualOnly: true },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function frame(id: string, statusLabel: string, children: SurfaceNode[]): SurfaceNode<"surface_frame"> {
  return {
    id: `${id}-frame`,
    type: "surface_frame",
    props: { eyebrow: "Adaptive Surface Engine", statusLabel },
    streaming: true,
    priority: "critical",
    children,
  };
}

function panel(
  id: string,
  title: string,
  subtitle: string | undefined,
  children: SurfaceNode[],
  tone: "default" | "muted" | "accent" | "danger" = "default",
): SurfaceNode<"panel"> {
  return { id, type: "panel", props: { title, subtitle, tone }, children, priority: "normal" };
}

function sectionGrid(id: string, children: SurfaceNode[]): SurfaceNode<"section_grid"> {
  return { id, type: "section_grid", props: { columns: 2 }, children };
}

function twoPane(
  id: string,
  children: SurfaceNode[],
  split: "balanced" | "main_aside" | "aside_main",
): SurfaceNode<"two_pane"> {
  return { id, type: "two_pane", props: { split, leftLabel: "Frame", rightLabel: "Evidence" }, children };
}

function insight(
  id: string,
  title: string,
  body: string,
  tone: "default" | "positive" | "warning" | "danger",
): SurfaceNode<"insight_card"> {
  return { id, type: "insight_card", props: { title, body, tone }, status: "forming" };
}

function decisionOption(id: string, label: string, tradeoff: string, confidenceValue: number): SurfaceNode<"decision_option_card"> {
  return { id, type: "decision_option_card", props: { label, tradeoff, confidence: confidenceValue } };
}

function comparisonTable(id: string, criteria: string[], options: string[]): SurfaceNode<"comparison_table"> {
  return { id, type: "comparison_table", props: { criteria, options }, streaming: true, priority: "high" };
}

function confidence(id: string, value = 0.22): SurfaceNode<"confidence_badge"> {
  return { id, type: "confidence_badge", props: { value: value > 1 ? value : value * 100, label: "intent confidence" } };
}

function actionList(
  id: string,
  title: string | undefined,
  items: Array<{ id: string; label: string; detail?: string; disabled?: boolean }>,
): SurfaceNode<"action_list"> {
  return { id, type: "action_list", props: { title, items } };
}

function questionQueue(id: string, questions: string[]): SurfaceNode<"question_queue"> {
  return { id, type: "question_queue", props: { questions }, streaming: true };
}

function evidence(id: string, title: string, body: string): SurfaceNode<"evidence_block"> {
  return { id, type: "evidence_block", props: { title, body } };
}

function sourceChip(
  id: string,
  label: string,
  sourceStatus: "planned" | "available" | "needs_permission",
): SurfaceNode<"source_chip"> {
  return { id, type: "source_chip", props: { label, status: sourceStatus } };
}

function risk(id: string, level: "low" | "medium" | "high"): SurfaceNode<"risk_badge"> {
  return { id, type: "risk_badge", props: { level } };
}

function approvalGate(
  id: string,
  proposedAction: string,
  target: string,
  gateRisk: "low" | "medium" | "high",
  requiredPermission: string,
): SurfaceNode<"approval_gate"> {
  return { id, type: "approval_gate", props: { proposedAction, target, risk: gateRisk, requiredPermission } };
}

function loading(id: string, label: string, rows: number): SurfaceNode<"loading_skeleton"> {
  return { id, type: "loading_skeleton", props: { label, rows }, streaming: true };
}

function status(
  id: string,
  label: string,
  tone: "neutral" | "active" | "success" | "warning" | "danger",
): SurfaceNode<"status_pill"> {
  return { id, type: "status_pill", props: { label, tone } };
}

function correction(id: string, text: string): SurfaceNode<"voice_correction_chip"> {
  return { id, type: "voice_correction_chip", props: { text } };
}

function detectOptions(input: SurfacePresetInput) {
  const options = input.entities?.length ? input.entities : splitOptions(input.transcript ?? input.topic ?? "");
  return options.length >= 2 ? options.slice(0, 4).map(titleCase) : ["Option A", "Option B"];
}

function splitOptions(value: string) {
  return value
    .split(/\b(?:versus|vs|against|and|or)\b|,/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 2)
    .slice(0, 4);
}

function sentenceOrSkeleton(value?: string) {
  return value?.trim() || "Listening for the first words...";
}

function cleanTopic(value: string) {
  return value.trim() || "Untitled work surface";
}

function titleWithSuffix(value: string, suffix: string) {
  return value.toLowerCase().includes(suffix.toLowerCase()) ? titleCase(value) : `${titleCase(value)} ${suffix}`;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 9)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
