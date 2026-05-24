import type { AppleMailMessageDetail } from "@/types/context";
import type { EmailAnalysisMemory } from "@/local-context/work-command-types";

export function analyzeEmailMessage(message: AppleMailMessageDetail): EmailAnalysisMemory {
  const body = normalizeBody(message.body);
  const evidence = selectEvidence(body, message.preview);
  const requestedAction = detectRequestedAction(body, message.subject);
  const relevanceJudgment = judgeRelevance(body, message.subject, message.sender, requestedAction);
  const summary = buildSummary(message, body, requestedAction);
  const artifactBody = [
    "# Email Analysis",
    "",
    `Source: ${message.subject || "Untitled email"}`,
    `From: ${message.sender || "Unknown sender"}`,
    `Mailbox: ${message.mailbox || "Unknown mailbox"}`,
    message.receivedAt ? `Received: ${message.receivedAt}` : null,
    "",
    "## Summary",
    summary,
    "",
    "## Requested Action",
    requestedAction,
    "",
    "## Relevance Judgment",
    relevanceJudgment,
    "",
    "## Evidence Used",
    ...evidence.map((item) => `- ${item}`),
  ].filter((item): item is string => Boolean(item)).join("\n");

  return {
    sourceEmailId: message.id,
    subject: message.subject,
    sender: message.sender,
    receivedAt: message.receivedAt,
    mailbox: message.mailbox,
    summary,
    requestedAction,
    relevanceJudgment,
    evidence,
    artifactBody,
  };
}

function normalizeBody(body: string) {
  return body.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function buildSummary(message: AppleMailMessageDetail, body: string, requestedAction: string) {
  const lead = firstMeaningfulSentence(body) ?? message.preview ?? "No readable body text was available.";
  const subject = message.subject ? `about "${message.subject}"` : "with no subject";
  return `${message.sender || "The sender"} wrote ${subject}. ${lead} ${requestedAction === "No explicit action request detected." ? "No direct request was detected from the readable text." : `The likely ask is: ${requestedAction}`}`;
}

function detectRequestedAction(body: string, subject: string) {
  const text = `${subject}\n${body}`.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/\b(pay|payment|invoice|receipt|billing|card|subscription)\b/, "Review a payment, invoice, receipt, billing, or subscription item."],
    [/\b(confirm|confirmation|verify|verification|approve|approval)\b/, "Confirm, verify, or approve something."],
    [/\b(reset|password|security|login|sign[- ]?in|2fa|two[- ]factor)\b/, "Review a security or account-access item."],
    [/\b(schedule|book|reschedule|meeting|appointment|calendar)\b/, "Review or respond to a scheduling item."],
    [/\b(reply|respond|get back|let me know|follow up|thoughts)\b/, "Reply or follow up with the sender."],
    [/\b(application|interview|candidate|role|job|recruit)\b/, "Review an application, interview, job, or recruiting item."],
    [/\b(invitation|invite|event|rsvp)\b/, "Review an invitation or event item."],
  ];

  return patterns.find(([pattern]) => pattern.test(text))?.[1] ?? "No explicit action request detected.";
}

function judgeRelevance(body: string, subject: string, sender: string, requestedAction: string) {
  const text = `${sender}\n${subject}\n${body}`.toLowerCase();
  if (/\b(newsletter|unsubscribe|sale|discount|promo|promotion|marketing)\b/.test(text)) {
    return requestedAction === "No explicit action request detected."
      ? "Likely low priority because it looks like bulk or marketing content."
      : "Potentially relevant, but review carefully because it also contains bulk or marketing signals.";
  }

  if (requestedAction !== "No explicit action request detected.") {
    return "Likely relevant because the readable text contains an action, account, payment, scheduling, invitation, or reply signal.";
  }

  return "Unclear priority because no strong action signal was detected in the readable text.";
}

function selectEvidence(body: string, preview?: string | null) {
  const sentences = splitSentences(body);
  const evidence = sentences
    .filter((sentence) => /\b(confirm|verify|approve|pay|invoice|security|login|schedule|meeting|reply|respond|application|invitation|event|rsvp|follow up|let me know)\b/i.test(sentence))
    .slice(0, 3);

  if (!evidence.length && preview?.trim()) {
    evidence.push(preview.trim());
  }

  if (!evidence.length) {
    evidence.push(firstMeaningfulSentence(body) ?? "No readable evidence sentence was available.");
  }

  return evidence.map((item) => truncate(item, 220));
}

function firstMeaningfulSentence(body: string) {
  return splitSentences(body).find((sentence) => sentence.length > 24) ?? null;
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}
