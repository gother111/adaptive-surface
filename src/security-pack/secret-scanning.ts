import { createHash } from "node:crypto";
import type { SecurityPreflightResult } from "@/security-pack/types";

export type GitleaksScanMode = "git" | "dir" | "stdin";

export interface GitleaksPreflightInput {
  mode: GitleaksScanMode;
  workspaceRoot: string;
  toolVersion?: string | null;
  executablePath?: string | null;
}

export interface SecretFinding {
  id: string;
  ruleId: string;
  severity: "low" | "medium" | "high";
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  commit?: string;
  redactedPreview: string;
  fingerprint: string;
  remediationState: "needs_review" | "rotated" | "revoked" | "false_positive";
}

export function preflightGitleaksScan(input: GitleaksPreflightInput): SecurityPreflightResult {
  if (!input.executablePath || !input.toolVersion) {
    return { ok: false, code: "tool_missing", message: "Gitleaks is not available. The surface can still show setup guidance and heuristic-only warnings." };
  }
  if (!isSupportedGitleaksVersion(input.toolVersion)) {
    return { ok: false, code: "tool_version_unsupported", message: `Unsupported Gitleaks version: ${input.toolVersion}. Expected >=8.19.0 <9.0.0.` };
  }

  const args = buildGitleaksArgs(input.mode, input.workspaceRoot);
  return {
    ok: true,
    message: "Gitleaks preflight passed for redacted local execution.",
    commandPreview: {
      adapterId: "gitleaks",
      executable: input.executablePath,
      args,
      redactedArgs: args.map((arg) => (arg === input.workspaceRoot ? "<workspace-root>" : arg)),
    },
  };
}

export function buildGitleaksArgs(mode: GitleaksScanMode, source: string) {
  if (mode === "stdin") return ["stdin", "--report-format", "json", "--redact"];
  return [mode, "--source", source, "--report-format", "json", "--redact"];
}

export function parseGitleaksJson(rawJson: string, workspaceRoot: string): SecretFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("invalid_tool_output: Gitleaks output is not valid JSON.");
  }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { leaks?: unknown[] }).leaks) ? (parsed as { leaks: unknown[] }).leaks : [];
  return rows.map((row) => normalizeGitleaksFinding(row, workspaceRoot));
}

export function normalizeGitleaksFinding(row: unknown, workspaceRoot: string): SecretFinding {
  const item = row as Record<string, unknown>;
  const file = stringField(item, "File") || stringField(item, "file") || "unknown";
  const relativeFile = relativePath(file, workspaceRoot);
  if (relativeFile.startsWith("..")) {
    throw new Error("unsafe_path: Gitleaks finding path escaped the approved root.");
  }
  const ruleId = stringField(item, "RuleID") || stringField(item, "RuleId") || stringField(item, "ruleID") || "unknown-rule";
  const redactedPreview = redactMatch(stringField(item, "Match") || stringField(item, "Secret") || stringField(item, "match") || "<redacted>");
  const fingerprint = stringField(item, "Fingerprint") || sha256Text(`${ruleId}:${relativeFile}:${redactedPreview}`);

  return {
    id: sha256Text(`${fingerprint}:${lineNumber(item, "StartLine")}`).slice(0, 16),
    ruleId,
    severity: "high",
    filePath: relativeFile,
    lineStart: lineNumber(item, "StartLine") ?? lineNumber(item, "line"),
    lineEnd: lineNumber(item, "EndLine") ?? lineNumber(item, "StartLine"),
    commit: stringField(item, "Commit"),
    redactedPreview,
    fingerprint,
    remediationState: "needs_review",
  };
}

export function isSupportedGitleaksVersion(version: string) {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor] = match.map(Number);
  return major === 8 && minor >= 19;
}

function stringField(item: Record<string, unknown>, key: string) {
  const value = item[key];
  return typeof value === "string" ? value : "";
}

function lineNumber(item: Record<string, unknown>, key: string) {
  const value = item[key];
  return typeof value === "number" ? value : undefined;
}

function relativePath(file: string, workspaceRoot: string) {
  const normalizedFile = normalizePath(file);
  const normalizedRoot = normalizePath(workspaceRoot);
  if (normalizedFile === normalizedRoot) return ".";
  if (normalizedFile.startsWith(`${normalizedRoot}/`)) return normalizedFile.slice(normalizedRoot.length + 1);
  if (!normalizedFile.startsWith("/")) return normalizedFile;
  return `../${normalizedFile}`;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function redactMatch(value: string) {
  if (value.includes("REDACTED")) return value;
  if (value.length <= 8) return "<redacted>";
  return `${value.slice(0, 2)}<redacted>${value.slice(-2)}`;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
