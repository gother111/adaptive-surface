import type { SecurityFeatureFlags } from "@/security-pack/types";

export const defaultSecurityFeatureFlags: SecurityFeatureFlags = {
  security_pack_enabled: true,
  security_mcp_review: true,
  security_secret_scan: true,
  security_threat_model: true,
  security_prompt_injection_detection: true,
  security_llm_guardrails: true,
  security_sbom_analysis: false,
  security_sigstore_verification: false,
  security_in_toto_verification: false,
  security_external_mcp_scanner: false,
  security_active_testing: false,
  security_artifact_signing: false,
  security_attestation_generation: false,
};

export function resolveSecurityFeatureFlags(overrides: Partial<SecurityFeatureFlags> = {}): SecurityFeatureFlags {
  return { ...defaultSecurityFeatureFlags, ...overrides };
}

export function securityFeatureForSkill(skillId: string): keyof SecurityFeatureFlags | null {
  switch (skillId) {
    case "auditing-mcp-servers-for-tool-poisoning":
      return "security_mcp_review";
    case "implementing-secret-scanning-with-gitleaks":
      return "security_secret_scan";
    case "performing-threat-modeling-with-owasp-threat-dragon":
      return "security_threat_model";
    case "detecting-ai-model-prompt-injection-attacks":
      return "security_prompt_injection_detection";
    case "implementing-llm-guardrails-for-security":
      return "security_llm_guardrails";
    case "analyzing-sbom-for-supply-chain-vulnerabilities":
      return "security_sbom_analysis";
    case "implementing-sigstore-for-software-signing":
      return "security_sigstore_verification";
    case "implementing-supply-chain-security-with-in-toto":
      return "security_in_toto_verification";
    default:
      return null;
  }
}
