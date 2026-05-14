import type { IntentDetection } from "@/intent/types";
import {
  createApprovalFlowBlueprint,
  createCatchUpBlueprint,
  createComparisonBlueprint,
  createDecisionBriefBlueprint,
  createNoteBlueprint,
  createResearchWorkspaceBlueprint,
} from "@/surface-engine/surface-presets";
import type { SurfaceConfig } from "@/types/surface";

export function buildSurfaceDraft(intent: IntentDetection, transcript: string): SurfaceConfig {
  const topic = titleCase(intent.topic || "Untitled work surface");
  const subtitle = intent.slots.correction
    ? "Correction detected. Morphing the surface without waiting for a final transcript."
    : `Building from live speech: "${trimForDisplay(transcript)}"`;
  const presetInput = {
    transcript,
    topic,
    subtitle,
    intent: intent.intent,
    confidence: intent.confidence,
    entities: intent.slots.entities,
    correction: intent.slots.correction,
  };

  switch (intent.surfaceKind) {
    case "brief":
      return {
        id: "voice-brief",
        kind: "brief",
        title: topic.includes("Brief") ? topic : `${topic} Brief`,
        subtitle,
        blueprint: createDecisionBriefBlueprint({
          ...presetInput,
          id: "voice-brief",
          title: topic.includes("Brief") ? topic : `${topic} Brief`,
        }),
        streamStatus: "streaming",
        briefBlocks: [
          { id: "context", title: "Context", body: sentenceOrSkeleton(transcript), status: "fresh" },
          { id: "decision", title: "Decision needed", body: "Listening for the choice, audience, and constraints.", status: "watching" },
          { id: "next", title: "Next actions", body: "Will fill as the request becomes clearer.", status: "watching" },
        ],
      };
    case "canvas":
      return {
        id: "voice-canvas",
        kind: "canvas",
        title: intent.intent === "freeform_canvas" ? "Freeform Canvas" : "Work Canvas",
        subtitle,
        streamStatus: "streaming",
      };
    case "decision":
      return {
        id: "voice-decision",
        kind: "decision",
        title: topic.includes("Decision") ? topic : `${topic} Decision`,
        subtitle,
        blueprint: createDecisionBriefBlueprint({
          ...presetInput,
          id: "voice-decision",
          kind: "decision",
          title: topic.includes("Decision") ? topic : `${topic} Decision`,
        }),
        streamStatus: "streaming",
        decisionOptions: [
          { id: "option-a", label: "Option A", confidence: 64, tradeoff: "Waiting for the first option from your speech." },
          { id: "option-b", label: "Option B", confidence: 52, tradeoff: "Listening for alternatives and constraints." },
          { id: "recommendation", label: "Recommendation", confidence: 41, tradeoff: "Will firm up after more context arrives." },
        ],
      };
    case "approval":
      return {
        id: "voice-approval",
        kind: "approval",
        title: "Approval Flow",
        subtitle,
        blueprint: createApprovalFlowBlueprint({
          ...presetInput,
          id: "voice-approval",
          title: "Approval Flow",
        }),
        streamStatus: "streaming",
        approvalActions: [
          { id: "review", label: "Review proposed action", target: sentenceOrSkeleton(transcript), risk: "medium" },
          { id: "confirm", label: "Wait for explicit confirmation", target: "No external action runs until approved.", risk: "low" },
        ],
      };
    case "note":
    case "summary":
      return {
        id: `voice-${intent.surfaceKind}`,
        kind: intent.surfaceKind,
        title: intent.title,
        subtitle,
        blueprint: createNoteBlueprint({
          ...presetInput,
          id: `voice-${intent.surfaceKind}`,
          kind: intent.surfaceKind,
          title: intent.title,
        }),
        streamStatus: "streaming",
        liveTranscript: transcript,
        topic,
        confidence: intent.confidence,
        sections: buildSections(intent, transcript),
      };
    case "research":
      return {
        id: "voice-research",
        kind: "research",
        title: intent.title,
        subtitle,
        blueprint: createResearchWorkspaceBlueprint({
          ...presetInput,
          id: "voice-research",
          title: intent.title,
        }),
        streamStatus: "streaming",
        liveTranscript: transcript,
        topic,
        confidence: intent.confidence,
        sections: buildSections(intent, transcript),
      };
    case "catch_up":
      return {
        id: "voice-catch_up",
        kind: "catch_up",
        title: intent.title,
        subtitle,
        blueprint: createCatchUpBlueprint({
          ...presetInput,
          id: "voice-catch_up",
          title: intent.title,
        }),
        streamStatus: "streaming",
        liveTranscript: transcript,
        topic,
        confidence: intent.confidence,
        sections: buildSections(intent, transcript),
      };
    case "comparison":
      return {
        id: `voice-${intent.surfaceKind}`,
        kind: intent.surfaceKind,
        title: intent.title,
        subtitle,
        blueprint: createComparisonBlueprint({
          ...presetInput,
          id: "voice-comparison",
          title: intent.title,
        }),
        streamStatus: "streaming",
        liveTranscript: transcript,
        topic,
        confidence: intent.confidence,
        sections: buildSections(intent, transcript),
      };
    default:
      return {
        id: "voice-note",
        kind: "note",
        title: "Quick Note",
        subtitle,
        streamStatus: "streaming",
        liveTranscript: transcript,
        topic,
        confidence: intent.confidence,
        sections: buildSections(intent, transcript),
      };
  }
}

function buildSections(intent: IntentDetection, transcript: string) {
  const fragments = transcript
    .split(/\b(?:and|then|also|with|plus)\b/i)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (intent.surfaceKind === "comparison") {
    return [
      { id: "criteria", title: "Criteria", items: ["Cost", "Speed", "Risk", "Fit"] },
      { id: "options", title: "Options heard", items: fragments.length ? fragments : ["Listening for items to compare"] },
    ];
  }

  if (intent.surfaceKind === "research") {
    return [
      { id: "questions", title: "Questions forming", items: fragments.length ? fragments : ["Listening for the research question"] },
      { id: "sources", title: "Source plan", items: ["Local notes first", "Web/source connector later", "Evidence log"] },
    ];
  }

  if (intent.surfaceKind === "catch_up") {
    return [
      { id: "timeline", title: "Timeline", items: ["Recent changes", "Open loops", "Recommended next step"] },
      { id: "signals", title: "Signals heard", items: fragments.length ? fragments : ["Listening for scope"] },
    ];
  }

  if (intent.surfaceKind === "summary") {
    return [
      { id: "main", title: "Main point", items: [sentenceOrSkeleton(transcript)] },
      { id: "details", title: "Details", items: fragments.length ? fragments : ["Waiting for more content"] },
    ];
  }

  return [
    { id: "note", title: "Captured note", items: fragments.length ? fragments : [sentenceOrSkeleton(transcript)] },
    { id: "follow-up", title: "Likely follow-up", items: ["Clarify owner", "Clarify deadline", "Turn into action if needed"] },
  ];
}

function sentenceOrSkeleton(transcript: string) {
  return transcript.trim() || "Listening for the first words...";
}

function trimForDisplay(transcript: string) {
  return transcript.length > 120 ? `${transcript.slice(0, 117)}...` : transcript;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 9)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
