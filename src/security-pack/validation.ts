import type { SecuritySkillManifest } from "@/security-pack/types";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function validateSecuritySkillManifest(manifest: SecuritySkillManifest): string[] {
  const errors: string[] = [];

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!manifest.id) errors.push("id is required");
  if (!manifest.displayName) errors.push("displayName is required");
  if (manifest.source.release !== "v1.3.0") errors.push("source.release must be v1.3.0");
  if (manifest.source.commit !== "101ca0bd887a295e39cc20a100efa571937ca969") errors.push("source.commit does not match pinned snapshot");
  if (manifest.source.license !== "Apache-2.0") errors.push("source.license must be Apache-2.0");
  if (manifest.source.reviewedAt !== "2026-06-24") errors.push("source.reviewedAt must match review date");
  if (!SHA256_PATTERN.test(manifest.source.sourceSha256)) errors.push("source.sourceSha256 must be a SHA-256 digest");
  if (!SHA256_PATTERN.test(manifest.source.curatedSha256)) errors.push("source.curatedSha256 must be a SHA-256 digest");
  if (!manifest.atlas.domainIds.every((domain) => domain === 53 || domain === 55)) errors.push("atlas.domainIds must stay in Domain 53 or 55");
  if (!manifest.routing.positiveExamples.length) errors.push("routing.positiveExamples is required");
  if (!manifest.routing.negativeExamples.length) errors.push("routing.negativeExamples is required");
  if (manifest.routing.confidenceThreshold <= 0 || manifest.routing.confidenceThreshold > 1) errors.push("routing.confidenceThreshold must be between 0 and 1");
  if (manifest.executors.some((executor) => executor.adapterId === "shell" || executor.adapterId === "bash")) errors.push("generic shell executors are prohibited");

  return errors;
}

export function assertValidSecuritySkillManifest(manifest: SecuritySkillManifest): void {
  const errors = validateSecuritySkillManifest(manifest);
  if (errors.length) {
    throw new Error(`Invalid Security Pack manifest ${manifest.id}: ${errors.join("; ")}`);
  }
}
