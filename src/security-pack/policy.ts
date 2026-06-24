import { getSecuritySkillManifest } from "@/security-pack/catalog";
import { resolveSecurityFeatureFlags } from "@/security-pack/feature-flags";
import type { SecurityFeatureFlags, SecurityPolicyDecision, SecurityPolicyRequest } from "@/security-pack/types";

const knownExecutableAdapters = new Set(["gitleaks", "snyk-agent-scan", "syft", "grype", "cosign", "in-toto-verify"]);
const disabledAdaptersByDefault = new Set(["snyk-agent-scan", "syft", "grype", "cosign", "in-toto-verify"]);
const destructiveActionWords = /\b(delete|destroy|rewrite-history|force-push|remove-credential|publish|sign|generate-key|probe|exploit)\b/i;

export function evaluateSecurityPolicy(
  request: SecurityPolicyRequest,
  featureFlags: Partial<SecurityFeatureFlags> = {},
): SecurityPolicyDecision {
  const flags = resolveSecurityFeatureFlags(featureFlags);
  const manifest = getSecuritySkillManifest(request.skillId);
  const reasons: string[] = [];

  if (!flags.security_pack_enabled) {
    return deny(["Security Pack feature flag is disabled."]);
  }

  if (!manifest) {
    return deny(["Unknown security skill."]);
  }

  if (destructiveActionWords.test(request.actionId)) {
    return deny(["Destructive, signing, publishing, key-generation, or active probing actions are denied in this MVP."]);
  }

  const unknownCapabilities = request.capabilityIds.filter((capability) => !manifest.capabilities.includes(capability));
  if (unknownCapabilities.length) {
    return deny([`Unknown capability for skill: ${unknownCapabilities.join(", ")}`]);
  }

  if (request.executableAdapter) {
    if (!knownExecutableAdapters.has(request.executableAdapter)) {
      return deny([`Unknown executable adapter: ${request.executableAdapter}`]);
    }
    if (disabledAdaptersByDefault.has(request.executableAdapter) && !adapterEnabled(request.executableAdapter, flags)) {
      return deny([`Executable adapter is feature-disabled: ${request.executableAdapter}`]);
    }
  }

  if (request.networkDestinations.length) {
    const undeclared = request.networkDestinations.filter((destination) => !manifest.network.allowedDestinations.includes(destination));
    if (undeclared.length) {
      return deny([`Undeclared network destination: ${undeclared.join(", ")}`], [], [], []);
    }
    reasons.push("Declared network access requires approval.");
  }

  const pathDecision = evaluatePaths(request);
  if (!pathDecision.ok) {
    return deny(pathDecision.reasons);
  }

  if (manifest.risk.tier === "R4" || request.dataClassifications.some((classification) => /credential|private_key|token/i.test(classification))) {
    return {
      effect: "require_approval",
      reasons: ["Step-up approval required for credential, signing, publication, privileged, or active-probing risk."],
      grantedCapabilities: request.capabilityIds,
      grantedPathScopes: pathDecision.scopes,
      grantedNetworkDestinations: request.networkDestinations,
      approval: {
        mode: "step_up",
        summary: "Review the exact identity, credential, destination, and reversibility before proceeding.",
      },
    };
  }

  if (request.writePaths.length || request.networkDestinations.length || manifest.risk.approval === "every_execution") {
    return {
      effect: "require_approval",
      reasons: [...reasons, "Security action requires explicit approval before execution."],
      grantedCapabilities: request.capabilityIds,
      grantedPathScopes: pathDecision.scopes,
      grantedNetworkDestinations: request.networkDestinations,
      approval: {
        mode: manifest.risk.approval === "every_execution" ? "per_execution" : "once",
        summary: approvalSummary(request),
      },
    };
  }

  return {
    effect: "allow",
    reasons: ["Policy allowed read-only deterministic security work inside the approved scope."],
    grantedCapabilities: request.capabilityIds,
    grantedPathScopes: pathDecision.scopes,
    grantedNetworkDestinations: [],
  };
}

function evaluatePaths(request: SecurityPolicyRequest): { ok: boolean; reasons: string[]; scopes: string[] } {
  const allPaths = [...request.readPaths, ...request.writePaths];
  if (!allPaths.length) return { ok: true, reasons: [], scopes: [] };

  if (!request.workspaceRoot) {
    return { ok: false, reasons: ["Missing workspace root for filesystem-scoped security action."], scopes: [] };
  }

  const root = normalizePath(request.workspaceRoot);
  const scopes = new Set<string>();
  for (const rawPath of allPaths) {
    const normalized = normalizePath(rawPath);
    if (hasTraversal(rawPath) || !isWithinRoot(normalized, root)) {
      return { ok: false, reasons: [`Path outside approved workspace scope: ${rawPath}`], scopes: [] };
    }
    scopes.add(root);
  }

  return { ok: true, reasons: [], scopes: Array.from(scopes) };
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function hasTraversal(value: string) {
  return value.split(/[\\/]+/).includes("..");
}

function isWithinRoot(value: string, root: string) {
  return value === root || value.startsWith(`${root}/`);
}

function adapterEnabled(adapterId: string, flags: SecurityFeatureFlags) {
  if (adapterId === "snyk-agent-scan") return flags.security_external_mcp_scanner;
  if (adapterId === "syft" || adapterId === "grype") return flags.security_sbom_analysis;
  if (adapterId === "cosign") return flags.security_sigstore_verification;
  if (adapterId === "in-toto-verify") return flags.security_in_toto_verification;
  return true;
}

function approvalSummary(request: SecurityPolicyRequest) {
  const reads = request.readPaths.length ? `read ${request.readPaths.length} scoped path(s)` : "no filesystem read";
  const writes = request.writePaths.length ? `write ${request.writePaths.length} scoped path(s)` : "no filesystem write";
  const network = request.networkDestinations.length ? `network: ${request.networkDestinations.join(", ")}` : "no network";
  const executable = request.executableAdapter ? `adapter: ${request.executableAdapter}` : "no executable adapter";
  return `${request.actionId}: ${reads}, ${writes}, ${network}, ${executable}.`;
}

function deny(
  reasons: string[],
  grantedCapabilities: string[] = [],
  grantedPathScopes: string[] = [],
  grantedNetworkDestinations: string[] = [],
): SecurityPolicyDecision {
  return {
    effect: "deny",
    reasons,
    grantedCapabilities,
    grantedPathScopes,
    grantedNetworkDestinations,
  };
}
