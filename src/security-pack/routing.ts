import { listSecurityCatalogEntries } from "@/security-pack/catalog";
import type { SecurityCatalogEntry, SecurityRouteCandidate, SecurityRouteContext, SecurityRouteResult, SecuritySurface } from "@/security-pack/types";

const NEGATIVE_EXAMPLE_PENALTY = 0.7;
const MAX_CANDIDATES = 3;

export function routeSecuritySkill(utterance: string, context: SecurityRouteContext = {}): SecurityRouteResult {
  const started = performance.now();
  const text = normalize(utterance);
  const entries = listSecurityCatalogEntries(context.featureFlags).filter((entry) => matchesContext(entry, context));

  const candidates = entries
    .map((entry): SecurityRouteCandidate => {
      const matchedSignals = matchedTerms(text, [
        ...entry.routing.requiredSignals,
        ...entry.atlas.workflowTags,
        ...entry.routing.positiveExamples,
      ]);
      const rejectedSignals = matchedTerms(text, entry.routing.negativeExamples);
      const confidence = Math.max(0, Math.min(0.99, scoreEntry(text, entry, matchedSignals, rejectedSignals)));
      return { entry, confidence, matchedSignals, rejectedSignals };
    })
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_CANDIDATES);

  const selected = candidates.find((candidate) => candidate.confidence >= candidate.entry.routing.confidenceThreshold) ?? null;
  const surface = selected ? selected.entry.atlas.surfaces[0] : fallbackSecuritySurface(text);
  const durationMs = Math.round((performance.now() - started) * 100) / 100;

  return {
    selected,
    candidates,
    surface,
    shouldExecute: false,
    reason: selected
      ? "Selected metadata candidate. Full curated procedure loads only after policy preflight and user scope selection."
      : "Low-confidence security routing opens a non-executing surface instead of guessing.",
    durationMs,
  };
}

function matchesContext(entry: SecurityCatalogEntry, context: SecurityRouteContext) {
  if (context.platform && context.platform !== "macos" && entry.id !== "detecting-ai-model-prompt-injection-attacks") {
    return false;
  }

  if (context.atlasDomainIds?.length && !context.atlasDomainIds.some((domainId) => entry.atlas.domainIds.includes(domainId))) {
    return false;
  }

  if (context.surface && !entry.atlas.surfaces.includes(context.surface)) {
    return false;
  }

  if (context.currentObjectKind === "repository" && entry.id === "implementing-secret-scanning-with-gitleaks") return true;
  if (context.currentObjectKind === "mcp" && entry.id === "auditing-mcp-servers-for-tool-poisoning") return true;
  if (context.currentObjectKind === "architecture" && entry.id === "performing-threat-modeling-with-owasp-threat-dragon") return true;
  if (context.currentObjectKind === "sbom" && entry.id === "analyzing-sbom-for-supply-chain-vulnerabilities") return true;
  return true;
}

function scoreEntry(text: string, entry: SecurityCatalogEntry, matchedSignals: string[], rejectedSignals: string[]) {
  let score = 0;
  if (matchedSignals.length) score += 0.28 + Math.min(0.34, matchedSignals.length * 0.08);
  if (entry.routing.requiredSignals.some((signal) => containsTerm(text, signal))) score += 0.22;
  if (entry.atlas.workflowTags.some((tag) => containsTerm(text, tag.replace(/-/g, " ")))) score += 0.16;
  if (entry.lifecycle === "production") score += 0.04;
  if (rejectedSignals.length) score -= NEGATIVE_EXAMPLE_PENALTY;

  if (entry.id === "auditing-mcp-servers-for-tool-poisoning" && /\bmcp\b/.test(text) && /\b(tool|server|integration|config)\b/.test(text)) score += 0.28;
  if (entry.id === "implementing-secret-scanning-with-gitleaks" && /\b(secret|api keys?|tokens?|credentials?|leak)\b/.test(text) && /\b(repo|repository|project|folder|directory|push|committed)\b/.test(text)) score += 0.3;
  if (entry.id === "performing-threat-modeling-with-owasp-threat-dragon" && /\b(threat|risk|trust boundary|data flow|architecture)\b/.test(text)) score += 0.3;
  if (entry.id === "analyzing-sbom-for-supply-chain-vulnerabilities" && /\b(sbom|cyclonedx|spdx)\b/.test(text)) score += 0.3;
  if (entry.id === "implementing-sigstore-for-software-signing" && /\b(sigstore|cosign|signature|signed|verify)\b/.test(text) && !/\bsign this contract\b/.test(text)) score += 0.25;
  if (entry.id === "implementing-supply-chain-security-with-in-toto" && /\b(in-toto|layout|link metadata|attestation)\b/.test(text)) score += 0.25;

  return score;
}

function fallbackSecuritySurface(text: string): SecuritySurface {
  if (/\bsecurity|secret|mcp|threat|sbom|sigstore|in-toto|prompt injection\b/.test(text)) {
    return "Security Console";
  }
  return "Decision Brief";
}

function matchedTerms(text: string, terms: string[]) {
  return terms.filter((term) => containsTerm(text, term));
}

function containsTerm(text: string, term: string) {
  const normalizedTerm = normalize(term).replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalizedTerm) return false;
  if (text.includes(normalizedTerm)) return true;
  const parts = normalizedTerm.split(/\s+/).filter((part) => part.length > 3 && !STOP_WORDS.has(part));
  if (parts.length > 1) {
    return parts.every((part) => text.includes(part));
  }
  return parts.length === 1 && text.includes(parts[0]);
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set(["this", "that", "with", "from", "before", "after", "normal", "about", "into"]);
