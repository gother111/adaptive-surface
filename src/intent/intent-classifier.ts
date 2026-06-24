import type { IntentCandidate, IntentDetection, IntentKind } from "@/intent/types";

const CANDIDATES: IntentCandidate[] = [
  {
    intent: "create_brief",
    surfaceKind: "brief",
    title: "Decision Brief",
    keywords: ["brief", "memo", "prepare", "write up", "one pager", "executive summary"],
    actionWords: ["prepare", "draft", "create", "write"],
    rationale: "Brief language maps to a structured operating brief.",
  },
  {
    intent: "open_canvas",
    surfaceKind: "canvas",
    title: "Work Canvas",
    keywords: ["canvas", "whiteboard", "map", "diagram", "sketch", "flow"],
    actionWords: ["open", "draw", "map", "sketch"],
    rationale: "Canvas language maps to a freeform tldraw surface.",
  },
  {
    intent: "freeform_canvas",
    surfaceKind: "canvas",
    title: "Freeform Canvas",
    keywords: ["brainstorm", "freeform", "mind map", "ideas", "explore visually"],
    actionWords: ["brainstorm", "explore", "ideate"],
    rationale: "Exploratory language maps to a freeform canvas.",
  },
  {
    intent: "summarize_content",
    surfaceKind: "summary",
    title: "Live Summary",
    keywords: ["summarize", "summary", "recap", "condense", "extract key points", "tl dr"],
    actionWords: ["summarize", "recap", "condense", "extract"],
    rationale: "Summary language maps to a progressive summary surface.",
  },
  {
    intent: "decision_help",
    surfaceKind: "decision",
    title: "Decision View",
    keywords: ["decide", "decision", "choose", "options", "tradeoffs", "pros and cons"],
    actionWords: ["decide", "choose", "compare", "evaluate"],
    rationale: "Decision language maps to options and tradeoffs.",
  },
  {
    intent: "quick_note",
    surfaceKind: "note",
    title: "Quick Note",
    keywords: ["note", "capture", "remember", "jot", "write this down"],
    actionWords: ["capture", "remember", "jot", "note"],
    rationale: "Capture language maps to a lightweight note surface.",
  },
  {
    intent: "research_mode",
    surfaceKind: "research",
    title: "Research Mode",
    keywords: ["research", "investigate", "look into", "sources", "find out", "study"],
    actionWords: ["research", "investigate", "find", "study"],
    rationale: "Research language maps to a source-and-question surface.",
  },
  {
    intent: "security_review",
    surfaceKind: "research",
    title: "Security Console",
    keywords: [
      "security",
      "threat model",
      "threat-model",
      "mcp server",
      "mcp integration",
      "secret scan",
      "gitleaks",
      "sbom",
      "sigstore",
      "in-toto",
      "prompt injection",
    ],
    actionWords: ["review", "audit", "scan", "verify", "check", "model"],
    rationale: "Security-domain language opens a non-executing Security Console while policy and scope are resolved.",
  },
  {
    intent: "catch_up",
    surfaceKind: "catch_up",
    title: "Catch-up Brief",
    keywords: ["catch me up", "catch up", "what changed", "updates", "since last time", "status"],
    actionWords: ["catch", "update", "review"],
    rationale: "Catch-up language maps to a status timeline.",
  },
  {
    intent: "show_calendar",
    surfaceKind: "calendar",
    title: "Calendar",
    keywords: ["calendar", "schedule", "events", "meetings", "today", "tomorrow", "this week"],
    actionWords: ["show", "open", "check", "find"],
    rationale: "Calendar language maps to the local Apple Calendar surface.",
  },
  {
    intent: "show_mail",
    surfaceKind: "mail",
    title: "Inbox",
    keywords: ["mail", "email", "inbox", "unread", "messages", "latest email"],
    actionWords: ["show", "open", "check", "find"],
    rationale: "Mail language maps to the local Apple Mail inbox surface.",
  },
  {
    intent: "show_notes",
    surfaceKind: "notes",
    title: "Notes",
    keywords: ["notes", "apple notes", "find note", "my notes", "note about"],
    actionWords: ["show", "open", "check", "find", "search"],
    rationale: "Notes language maps to the local Apple Notes surface.",
  },
  {
    intent: "comparison_table",
    surfaceKind: "comparison",
    title: "Comparison Table",
    keywords: ["comparison", "compare", "versus", "vs", "table", "matrix"],
    actionWords: ["compare", "rank", "evaluate"],
    rationale: "Comparison language maps to a tabular surface.",
  },
  {
    intent: "approval_flow",
    surfaceKind: "approval",
    title: "Approval Flow",
    keywords: ["approve", "approval", "permission", "before sending", "review before", "confirm"],
    actionWords: ["approve", "confirm", "review", "send"],
    rationale: "Approval language maps to an explicit action gate.",
  },
];

const CORRECTION_PATTERNS = /\b(no|actually|change it|make it|switch|instead|not that)\b/i;

export function classifyPartialTranscript(transcript: string): IntentDetection | null {
  const normalized = normalizeTranscript(transcript);

  if (normalized.length < 2) {
    return null;
  }

  const correction = CORRECTION_PATTERNS.test(normalized);
  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    score: scoreCandidate(normalized, candidate, correction),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.18) {
    return fallbackIntent(normalized, correction);
  }

  return toDetection(best.candidate, normalized, Math.min(0.98, best.score), correction);
}

function normalizeTranscript(transcript: string) {
  return transcript.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreCandidate(transcript: string, candidate: IntentCandidate, correction: boolean) {
  let score = 0;

  for (const keyword of candidate.keywords) {
    if (transcript.includes(keyword)) {
      score += keyword.includes(" ") ? 0.38 : 0.26;
    }
  }

  for (const action of candidate.actionWords) {
    if (transcript.includes(action)) {
      score += 0.12;
    }
  }

  if (correction && correctionTargetsIntent(transcript, candidate.intent)) {
    score += 0.4;
  }

  if (transcript.length > 18) {
    score += 0.08;
  }

  return score;
}

function correctionTargetsIntent(transcript: string, intent: IntentKind) {
  const correctionTail = transcript.split(/\b(?:actually|instead|change it to|make it|switch to|no)\b/i).pop() ?? transcript;

  const candidate = CANDIDATES.find((item) => item.intent === intent);
  return candidate?.keywords.some((keyword) => correctionTail.includes(keyword)) ?? false;
}

function fallbackIntent(transcript: string, correction: boolean): IntentDetection {
  const title = transcript.length > 22 ? "Adaptive Draft" : "Listening Surface";

  return {
    intent: "quick_note",
    confidence: 0.22,
    surfaceKind: "note",
    title,
    topic: extractTopic(transcript),
    slots: {
      entities: extractEntities(transcript),
      actionWords: [],
      correction,
    },
    rationale: "Fallback keeps latency low while more words arrive.",
  };
}

function toDetection(
  candidate: IntentCandidate,
  transcript: string,
  confidence: number,
  correction: boolean,
): IntentDetection {
  return {
    intent: candidate.intent,
    confidence,
    surfaceKind: candidate.surfaceKind,
    title: candidate.title,
    topic: extractTopic(transcript),
    slots: {
      entities: extractEntities(transcript),
      actionWords: candidate.actionWords.filter((word) => transcript.includes(word)),
      correction,
    },
    rationale: candidate.rationale,
  };
}

function extractTopic(transcript: string) {
  const topic = transcript
    .replace(/\b(please|can you|could you|i need|i want|make|create|prepare|open|start|build|a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!topic) {
    return "Untitled work surface";
  }

  return topic.slice(0, 96);
}

function extractEntities(transcript: string) {
  return transcript
    .split(/\b(?:about|for|between|versus|vs|on|regarding)\b/i)
    .slice(1)
    .join(" ")
    .split(/\band\b|,|\./)
    .map((entity) => entity.trim())
    .filter(Boolean)
    .slice(0, 6);
}
