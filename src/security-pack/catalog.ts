import { resolveSecurityFeatureFlags, securityFeatureForSkill } from "@/security-pack/feature-flags";
import type {
  CuratedSecurityProcedure,
  SecurityCatalogEntry,
  SecurityFeatureFlags,
  SecuritySkillId,
  SecuritySkillManifest,
} from "@/security-pack/types";

const repository = "https://github.com/mukul975/Anthropic-Cybersecurity-Skills" as const;
const release = "v1.3.0" as const;
const commit = "101ca0bd887a295e39cc20a100efa571937ca969" as const;
const reviewedAt = "2026-06-24" as const;

const sourceHashes: Record<SecuritySkillId, string> = {
  "auditing-mcp-servers-for-tool-poisoning": "efcf2f5d77647dd44db2f9b181d5447107d5ee7cb94bfbedc5d04bb70596b579",
  "detecting-ai-model-prompt-injection-attacks": "404dc1296acaeecd9f89f79bafe6d99425894030b60ceec542d56cf948350970",
  "implementing-llm-guardrails-for-security": "1cf02a88ea563459705e0f6a48a019ca5ae65711b3b736985b9004083d97a209",
  "implementing-secret-scanning-with-gitleaks": "b4edc041a407d5b88dc54de6085088c797cd97a63d82de605c39436346ff4cc4",
  "performing-threat-modeling-with-owasp-threat-dragon": "f343a1c66955144e9c38a0839af1a0d51134ea33383933568444e94adb062737",
  "analyzing-sbom-for-supply-chain-vulnerabilities": "23d96721e66fbe5327d25641115e76eb7711c065defbb0ccaadd585fe008a391",
  "implementing-sigstore-for-software-signing": "4f1db3501f4427d3e78bd6c07e95dcbd70b8af1fde4d8e77615106b9bea76418",
  "implementing-supply-chain-security-with-in-toto": "4934298a2df5e0462a212418fe8ecd5125452cb5d35d63164e9b043c22291438",
};

const curatedHashes: Record<SecuritySkillId, string> = {
  "auditing-mcp-servers-for-tool-poisoning": "a4b4f4ea461783d77adea075e65c2fb12b5c7f0b5340658cf8e0a1e613f080b3",
  "detecting-ai-model-prompt-injection-attacks": "a7c9f5b9d6a3bb3c1763848a1e3fe314df5cbbf79ab3e2592a82f83e1174d4d3",
  "implementing-llm-guardrails-for-security": "5c80f9b9771947a8dc5d68921f2934fa6b2c7e29f51697d3a8e5fc4115730538",
  "implementing-secret-scanning-with-gitleaks": "130f65c5d180d89b4d225c99758f6e1a88a72361c6ab78f903afab1efa126156",
  "performing-threat-modeling-with-owasp-threat-dragon": "58005d3ca229f124a2f328cc223c9ab40113dfde15c4cedd7307d4e9555af28c",
  "analyzing-sbom-for-supply-chain-vulnerabilities": "f13fbfeff3f9c8e0f537a6fbd9d9ff4dbcb878c6be8a65e43af0ed1fb884d3fe",
  "implementing-sigstore-for-software-signing": "7ab5a42441f450ea261b18f89fa7a0f1f06064ec387be958f5651e065da66d21",
  "implementing-supply-chain-security-with-in-toto": "613f54674d9a0b9150d9b31e1b70081c19fbe4fca9cfe7c7b4b3c60b0a41f887",
};

export const SECURITY_SKILL_MANIFESTS: SecuritySkillManifest[] = [
  manifest({
    id: "auditing-mcp-servers-for-tool-poisoning",
    displayName: "MCP Integration Review",
    summary: "Review MCP server metadata, tool definitions, schemas, destinations, and baseline drift before connection.",
    lifecycle: "production",
    domains: [53, 55],
    workflowTags: ["mcp-review", "tool-poisoning", "integration-risk", "baseline-drift"],
    surfaces: ["Integration Map", "Security Console", "Risk Register", "Approval Flow"],
    positives: [
      "Review this MCP server before I connect it.",
      "Is this MCP integration safe?",
      "Check whether these tool descriptions changed.",
      "Audit the tools exposed by this MCP server.",
    ],
    negatives: ["Review this normal API integration.", "Scan this PDF.", "Debug my local server."],
    requiredSignals: ["mcp", "tool"],
    threshold: 0.62,
    capabilities: ["security.mcp.inventory", "security.mcp.static_review", "security.mcp.baseline_compare"],
    tier: "R1",
    approval: "once_per_scope",
    sideEffects: ["Optional baseline pin requires explicit local write approval."],
    readableScopes: ["user_selected_mcp_config", "registered_integration_metadata"],
    writableScopes: ["approved_mcp_baseline"],
    classifications: ["tool_metadata", "integration_config"],
    networkDefault: "deny",
    networkPurpose: ["No network in default static review."],
    executors: [{ adapterId: "snyk-agent-scan", required: false, supportedVersionRange: "reviewed-only" }],
  }),
  manifest({
    id: "implementing-secret-scanning-with-gitleaks",
    displayName: "Secret Scanning",
    summary: "Run or preflight a redacted, scoped secret scan for a selected repository or directory.",
    lifecycle: "production",
    domains: [53],
    workflowTags: ["secret-scan", "repository-review", "pre-push-check"],
    surfaces: ["Security Console", "Evidence Board", "Risk Register", "Approval Flow"],
    positives: ["Scan this repository for leaked secrets.", "Check this project before I push it.", "Find committed API keys.", "Run a redacted secret scan on this folder."],
    negatives: ["Scan this PDF.", "Tell me a secret.", "Mention secrets in this paragraph."],
    requiredSignals: ["secret", "repository"],
    threshold: 0.6,
    capabilities: ["security.secrets.scan.readonly", "security.secrets.parse_gitleaks"],
    tier: "R2",
    approval: "every_execution",
    sideEffects: ["Runs a local process when the Gitleaks adapter is available.", "Temporary redacted reports are deleted after parsing."],
    readableScopes: ["user_selected_repository", "user_selected_directory"],
    writableScopes: ["app_temporary_directory"],
    classifications: ["source_paths", "redacted_secret_findings"],
    networkDefault: "deny",
    networkPurpose: ["Gitleaks scan runs locally without network."],
    executors: [{ adapterId: "gitleaks", required: false, supportedVersionRange: ">=8.19.0 <9.0.0" }],
  }),
  manifest({
    id: "performing-threat-modeling-with-owasp-threat-dragon",
    displayName: "Threat Modeling",
    summary: "Create a neutral internal threat model with trust boundaries, threats, mitigations, evidence, and assumptions.",
    lifecycle: "production",
    domains: [53, 55],
    workflowTags: ["threat-model", "stride", "linddun", "architecture-risk"],
    surfaces: ["Infinite Canvas", "Risk Register", "Review Room", "Decision Brief"],
    positives: ["Threat-model this integration.", "Build a security risk model for this feature.", "Map the trust boundaries in this architecture.", "What could go wrong with this data flow?"],
    negatives: ["Model this financial scenario.", "Make a 3D model.", "Review grammar in this architecture doc."],
    requiredSignals: ["threat", "architecture"],
    threshold: 0.58,
    capabilities: ["security.threat_model.create", "security.threat_model.recalculate"],
    tier: "R0",
    approval: "none",
    sideEffects: ["No external process required for the native model."],
    readableScopes: ["user_supplied_architecture", "selected_design_context"],
    writableScopes: ["surface_state"],
    classifications: ["architecture_metadata", "risk_assumptions"],
    networkDefault: "deny",
    networkPurpose: ["Threat Dragon is optional and not required."],
    executors: [],
  }),
  manifest({
    id: "detecting-ai-model-prompt-injection-attacks",
    displayName: "Prompt-Injection Signals",
    summary: "Advisory local signals for instruction override, hidden text, role impersonation, and exfiltration requests.",
    lifecycle: "internal",
    domains: [53, 55],
    workflowTags: ["prompt-injection", "untrusted-content", "ai-safety"],
    surfaces: ["Security Console", "Evidence Board"],
    positives: ["Detect prompt injection in this retrieved content.", "Check this MCP description for hidden instructions."],
    negatives: ["Write about prompt injection history.", "Explain what prompt injection means."],
    requiredSignals: ["prompt", "instruction"],
    threshold: 0.56,
    capabilities: ["security.prompt_injection.inspect"],
    tier: "R0",
    approval: "none",
    sideEffects: ["Advisory only; does not authorize or block actions by itself."],
    readableScopes: ["untrusted_text_boundary"],
    writableScopes: [],
    classifications: ["untrusted_text_signals"],
    networkDefault: "deny",
    networkPurpose: ["No model classifier on the MVP path."],
    executors: [],
  }),
  manifest({
    id: "implementing-llm-guardrails-for-security",
    displayName: "LLM Tool Guardrails",
    summary: "Provider-neutral input, context, output, and tool-intent guards that feed deterministic policy.",
    lifecycle: "internal",
    domains: [53, 55],
    workflowTags: ["llm-guardrails", "tool-intent", "schema-validation"],
    surfaces: ["Security Console", "Approval Flow"],
    positives: ["Validate this model output before tool execution.", "Add guardrails around retrieved content."],
    negatives: ["Install NeMo Guardrails.", "Moderate a public chat room."],
    requiredSignals: ["guard", "tool"],
    threshold: 0.56,
    capabilities: ["security.guardrails.inspect", "security.tool_intent.validate"],
    tier: "R0",
    approval: "none",
    sideEffects: ["Unknown tool fields fail closed where security-relevant."],
    readableScopes: ["model_input", "model_output", "proposed_tool_intent"],
    writableScopes: [],
    classifications: ["redacted_guard_trace"],
    networkDefault: "deny",
    networkPurpose: ["No external guardrail service in MVP."],
    executors: [],
  }),
  manifest({
    id: "analyzing-sbom-for-supply-chain-vulnerabilities",
    displayName: "SBOM Analysis",
    summary: "Parse existing CycloneDX or SPDX SBOM files locally and normalize component and vulnerability evidence.",
    lifecycle: "experimental",
    domains: [53],
    workflowTags: ["sbom", "supply-chain", "dependency-risk"],
    surfaces: ["Evidence Matrix", "Risk Register", "Quality Dashboard"],
    positives: ["Analyze this CycloneDX SBOM.", "Review this SPDX document for vulnerable components."],
    negatives: ["Scan my running server.", "Generate an SBOM by installing tools."],
    requiredSignals: ["sbom"],
    threshold: 0.6,
    capabilities: ["security.sbom.parse"],
    tier: "R1",
    approval: "once_per_scope",
    sideEffects: ["External Syft or Grype execution is disabled by default."],
    readableScopes: ["user_selected_sbom"],
    writableScopes: [],
    classifications: ["component_inventory", "vulnerability_metadata"],
    networkDefault: "approval_required",
    networkPurpose: ["Optional vulnerability provider queries require explicit disclosure."],
    executors: [
      { adapterId: "syft", required: false, supportedVersionRange: "reviewed-only" },
      { adapterId: "grype", required: false, supportedVersionRange: "reviewed-only" },
    ],
  }),
  manifest({
    id: "implementing-sigstore-for-software-signing",
    displayName: "Sigstore Verification",
    summary: "Verification-only Cosign/Sigstore checks for artifact identity, issuer, digest, and transparency evidence.",
    lifecycle: "experimental",
    domains: [53],
    workflowTags: ["sigstore", "cosign", "verification-only", "supply-chain"],
    surfaces: ["Security Console", "Evidence Board", "Approval Flow", "Audit Trail"],
    positives: ["Verify this artifact signature with Cosign.", "Check whether this image was signed by the expected workflow."],
    negatives: ["Sign this contract.", "Sign and publish this artifact.", "Create a signing key."],
    requiredSignals: ["signature", "verify"],
    threshold: 0.62,
    capabilities: ["security.sigstore.verify"],
    tier: "R2",
    approval: "every_execution",
    sideEffects: ["Verification only; signing, publishing, and OIDC token requests remain disabled."],
    readableScopes: ["user_selected_artifact", "provided_signature_bundle"],
    writableScopes: [],
    classifications: ["artifact_digest", "certificate_identity"],
    networkDefault: "approval_required",
    networkPurpose: ["Transparency log verification may need disclosed network access."],
    executors: [{ adapterId: "cosign", required: false, supportedVersionRange: "reviewed-only" }],
  }),
  manifest({
    id: "implementing-supply-chain-security-with-in-toto",
    displayName: "in-toto Verification",
    summary: "Verification-only parsing and checks for existing in-toto layouts and link metadata.",
    lifecycle: "experimental",
    domains: [53],
    workflowTags: ["in-toto", "attestation", "verification-only", "supply-chain"],
    surfaces: ["Integration Map", "Evidence Board", "Risk Register", "Audit Trail"],
    positives: ["Verify this in-toto layout.", "Check this link metadata against the layout."],
    negatives: ["Generate in-toto keys.", "Sign this layout.", "Publish an attestation."],
    requiredSignals: ["in-toto", "verify"],
    threshold: 0.62,
    capabilities: ["security.in_toto.verify"],
    tier: "R2",
    approval: "every_execution",
    sideEffects: ["Verification only; key generation, signing, and publication are disabled."],
    readableScopes: ["user_selected_layout", "user_selected_link_metadata"],
    writableScopes: [],
    classifications: ["supply_chain_metadata", "functionary_identity"],
    networkDefault: "deny",
    networkPurpose: ["No network required for local metadata verification."],
    executors: [{ adapterId: "in-toto-verify", required: false, supportedVersionRange: "reviewed-only" }],
  }),
];

export const SECURITY_CATALOG_METADATA: SecurityCatalogEntry[] = SECURITY_SKILL_MANIFESTS.map((manifestItem) => ({
  id: manifestItem.id,
  displayName: manifestItem.displayName,
  summary: manifestItem.summary,
  lifecycle: manifestItem.lifecycle,
  atlas: manifestItem.atlas,
  routing: manifestItem.routing,
  risk: manifestItem.risk,
  capabilities: manifestItem.capabilities,
}));

export function listSecurityCatalogEntries(flags: Partial<SecurityFeatureFlags> = {}): SecurityCatalogEntry[] {
  const resolved = resolveSecurityFeatureFlags(flags);
  if (!resolved.security_pack_enabled) return [];

  return SECURITY_CATALOG_METADATA.filter((entry) => {
    const feature = securityFeatureForSkill(entry.id);
    return feature ? resolved[feature] : false;
  });
}

export function getSecuritySkillManifest(id: SecuritySkillId): SecuritySkillManifest | null {
  return SECURITY_SKILL_MANIFESTS.find((manifestItem) => manifestItem.id === id) ?? null;
}

export async function loadCuratedSecurityProcedure(id: SecuritySkillId): Promise<CuratedSecurityProcedure> {
  const module = await import("@/security-pack/procedures");
  return module.getCuratedSecurityProcedure(id);
}

function manifest(input: {
  id: SecuritySkillId;
  displayName: string;
  summary: string;
  lifecycle: SecuritySkillManifest["lifecycle"];
  domains: Array<53 | 55>;
  workflowTags: string[];
  surfaces: SecuritySkillManifest["atlas"]["surfaces"];
  positives: string[];
  negatives: string[];
  requiredSignals: string[];
  threshold: number;
  capabilities: string[];
  tier: SecuritySkillManifest["risk"]["tier"];
  approval: SecuritySkillManifest["risk"]["approval"];
  sideEffects: string[];
  readableScopes: string[];
  writableScopes: string[];
  classifications: string[];
  networkDefault: SecuritySkillManifest["network"]["default"];
  networkPurpose: string[];
  executors: SecuritySkillManifest["executors"];
}): SecuritySkillManifest {
  return {
    schemaVersion: 1,
    id: input.id,
    displayName: input.displayName,
    summary: input.summary,
    lifecycle: input.lifecycle,
    source: {
      repository,
      release,
      commit,
      path: `skills/${input.id}/SKILL.md`,
      license: "Apache-2.0",
      reviewedAt,
      sourceSha256: sourceHashes[input.id],
      curatedSha256: curatedHashes[input.id],
    },
    atlas: {
      domainIds: input.domains,
      workflowTags: input.workflowTags,
      surfaces: input.surfaces,
    },
    routing: {
      positiveExamples: input.positives,
      negativeExamples: input.negatives,
      requiredSignals: input.requiredSignals,
      confidenceThreshold: input.threshold,
    },
    platform: {
      macos: true,
      minimumVersion: "13.0",
    },
    capabilities: input.capabilities,
    risk: {
      tier: input.tier,
      approval: input.approval,
      possibleSideEffects: input.sideEffects,
    },
    dataAccess: {
      readableScopes: input.readableScopes,
      writableScopes: input.writableScopes,
      classifications: input.classifications,
      defaultPersistence: input.writableScopes.length ? "local" : "ephemeral",
    },
    network: {
      default: input.networkDefault,
      allowedDestinations: [],
      purpose: input.networkPurpose,
    },
    executors: input.executors,
    verification: [
      "Manifest validates against the project-owned schema.",
      "Policy preflight runs before executable or write-capable work.",
      "Raw upstream source remains reference-only.",
    ],
    rollback: ["Disable the feature flag to remove routing exposure.", "Remove approved local baseline entries created through explicit approval."],
  };
}
