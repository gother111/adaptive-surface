import { createHash } from "node:crypto";
import { inspectPromptInjection } from "@/security-pack/guards";

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface McpServerInventory {
  serverId: string;
  transport: "stdio" | "sse" | "http" | "unknown";
  commandOrEndpoint?: string;
  environmentVariableNames: string[];
  tools: McpToolDefinition[];
  resources?: Array<{ uri: string; name?: string; description?: string }>;
  prompts?: Array<{ name: string; description?: string }>;
}

export interface McpReviewFinding {
  code:
    | "prompt_injection_signal"
    | "unicode_control"
    | "credential_exfiltration_language"
    | "private_network_destination"
    | "duplicate_tool_name"
    | "confusing_tool_name"
    | "schema_changed"
    | "tool_added"
    | "tool_removed"
    | "excessive_scope";
  severity: "low" | "medium" | "high";
  subject: string;
  detail: string;
}

export interface McpReviewResult {
  inventoryHash: string;
  toolHashes: Record<string, string>;
  findings: McpReviewFinding[];
  recommendation: "allow" | "allow_in_sandbox" | "review_required" | "reject";
}

export function reviewMcpInventory(inventory: McpServerInventory, baseline?: Record<string, string>): McpReviewResult {
  const toolHashes = Object.fromEntries(inventory.tools.map((tool) => [tool.name, hashJson(canonicalizeMcpTool(tool))]));
  const findings: McpReviewFinding[] = [];
  const names = new Map<string, number>();

  for (const tool of inventory.tools) {
    const normalizedName = normalizeToolName(tool.name);
    names.set(normalizedName, (names.get(normalizedName) ?? 0) + 1);
    const text = `${tool.name}\n${tool.description ?? ""}`;
    const guard = inspectPromptInjection({ text, provenance: `mcp:${inventory.serverId}:${tool.name}`, trusted: false });
    if (guard.signals.length) {
      findings.push({
        code: "prompt_injection_signal",
        severity: guard.confidence > 0.8 ? "high" : "medium",
        subject: tool.name,
        detail: guard.reasons.join(" "),
      });
    }
    if (/\b(api keys?|passwords?|tokens?|private keys?|secrets?)\b/i.test(text)) {
      findings.push({ code: "credential_exfiltration_language", severity: "high", subject: tool.name, detail: "Tool wording references credentials or secret material." });
    }
    if (/\b(home|desktop|documents|downloads|\/|~\/|\$HOME)\b/i.test(text) && /\b(all|recursive|entire|every)\b/i.test(text)) {
      findings.push({ code: "excessive_scope", severity: "high", subject: tool.name, detail: "Tool description suggests broad local filesystem scope." });
    }
    const destination = extractUrl(text);
    if (destination && isPrivateNetworkDestination(destination)) {
      findings.push({ code: "private_network_destination", severity: "high", subject: tool.name, detail: `Private or metadata network destination referenced: ${destination}` });
    }
  }

  for (const [normalizedName, count] of names.entries()) {
    if (count > 1) findings.push({ code: "duplicate_tool_name", severity: "medium", subject: normalizedName, detail: "Multiple tools normalize to the same name." });
  }

  const allNames = inventory.tools.map((tool) => tool.name);
  for (const left of allNames) {
    for (const right of allNames) {
      if (left < right && levenshtein(normalizeToolName(left), normalizeToolName(right)) === 1) {
        findings.push({ code: "confusing_tool_name", severity: "low", subject: `${left}/${right}`, detail: "Tool names are confusingly similar." });
      }
    }
  }

  if (baseline) {
    for (const [toolName, hash] of Object.entries(toolHashes)) {
      if (!baseline[toolName]) findings.push({ code: "tool_added", severity: "medium", subject: toolName, detail: "Tool is not present in the approved baseline." });
      else if (baseline[toolName] !== hash) findings.push({ code: "schema_changed", severity: "high", subject: toolName, detail: "Tool definition hash changed after baseline approval." });
    }
    for (const toolName of Object.keys(baseline)) {
      if (!toolHashes[toolName]) findings.push({ code: "tool_removed", severity: "medium", subject: toolName, detail: "Previously approved tool is missing." });
    }
  }

  const inventoryHash = hashJson({ serverId: inventory.serverId, transport: inventory.transport, commandOrEndpoint: inventory.commandOrEndpoint, toolHashes });
  return {
    inventoryHash,
    toolHashes,
    findings,
    recommendation: recommendationFor(findings),
  };
}

export function canonicalizeMcpTool(tool: McpToolDefinition) {
  return sortKeys({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? null,
    outputSchema: tool.outputSchema ?? null,
    annotations: tool.annotations ?? null,
  });
}

function recommendationFor(findings: McpReviewFinding[]): McpReviewResult["recommendation"] {
  if (findings.some((finding) => finding.severity === "high" && finding.code !== "schema_changed")) return "reject";
  if (findings.some((finding) => finding.severity === "high" || finding.code === "tool_added" || finding.code === "schema_changed")) return "review_required";
  if (findings.length) return "allow_in_sandbox";
  return "allow";
}

function extractUrl(text: string) {
  return text.match(/https?:\/\/[^\s"')]+/i)?.[0] ?? null;
}

function isPrivateNetworkDestination(value: string) {
  try {
    const host = new URL(value).hostname;
    return (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "metadata.google.internal" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sortKeys(value))).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

function normalizeToolName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function levenshtein(left: string, right: string) {
  const matrix = Array.from({ length: left.length + 1 }, (_, row) => Array.from({ length: right.length + 1 }, (_, col) => row + col));
  for (let row = 1; row <= left.length; row += 1) matrix[row][0] = row;
  for (let col = 1; col <= right.length; col += 1) matrix[0][col] = col;
  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(matrix[row - 1][col] + 1, matrix[row][col - 1] + 1, matrix[row - 1][col - 1] + cost);
    }
  }
  return matrix[left.length][right.length];
}
