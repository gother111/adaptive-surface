export interface NormalizedSbomComponent {
  name: string;
  version?: string;
  packageUrl?: string;
  supplier?: string;
  licenses: string[];
  hashes: string[];
  dependencyType: "direct" | "transitive" | "unknown";
}

export interface NormalizedVulnerability {
  id: string;
  componentName: string;
  severity: "unknown" | "low" | "medium" | "high" | "critical";
  fixedVersion?: string;
  sourceProvider: string;
  confidence: "low" | "medium" | "high";
}

export interface SbomAnalysisResult {
  format: "cyclonedx" | "spdx";
  components: NormalizedSbomComponent[];
  vulnerabilities: NormalizedVulnerability[];
  warnings: string[];
}

export interface SigstoreVerificationInput {
  digest: string;
  certificateIssuer?: string;
  certificateSubject?: string;
  expectedIssuer?: string;
  expectedSubject?: string;
  transparencyLogVerified?: boolean;
}

export interface VerificationSummary {
  ok: boolean;
  reasons: string[];
}

export interface InTotoLayout {
  expires?: string;
  steps: Array<{ name: string; expectedCommand?: string[]; threshold?: number; authorizedFunctionaries?: string[] }>;
}

export interface InTotoLink {
  stepName: string;
  functionary: string;
  command?: string[];
  materials?: Record<string, string>;
  products?: Record<string, string>;
}

export function analyzeSbomDocument(document: unknown): SbomAnalysisResult {
  const input = document as Record<string, unknown>;
  if (input.bomFormat === "CycloneDX") return analyzeCycloneDx(input);
  if (input.spdxVersion) return analyzeSpdx(input);
  throw new Error("invalid_tool_output: Unsupported SBOM document. Expected CycloneDX or SPDX JSON.");
}

export function verifySigstoreEvidence(input: SigstoreVerificationInput): VerificationSummary {
  const reasons: string[] = [];
  if (!/^sha256:[a-f0-9]{64}$/i.test(input.digest)) reasons.push("Artifact digest is missing or not a SHA-256 digest.");
  if (input.expectedIssuer && input.certificateIssuer !== input.expectedIssuer) reasons.push("Certificate issuer does not match expected trust policy.");
  if (input.expectedSubject && input.certificateSubject !== input.expectedSubject) reasons.push("Certificate subject does not match expected identity.");
  if (!input.transparencyLogVerified) reasons.push("Transparency-log or bundle evidence is missing.");
  return { ok: reasons.length === 0, reasons: reasons.length ? reasons : ["Sigstore verification evidence matches the explicit trust policy."] };
}

export function verifyInTotoMetadata(layout: InTotoLayout, links: InTotoLink[], now = new Date()): VerificationSummary {
  const reasons: string[] = [];
  const stepNames = new Set<string>();
  for (const step of layout.steps) {
    if (stepNames.has(step.name)) reasons.push(`Duplicate layout step: ${step.name}`);
    stepNames.add(step.name);
    const matchingLinks = links.filter((link) => link.stepName === step.name);
    if ((step.threshold ?? 1) > matchingLinks.length) reasons.push(`Threshold failure for step ${step.name}.`);
    for (const link of matchingLinks) {
      if (step.authorizedFunctionaries?.length && !step.authorizedFunctionaries.includes(link.functionary)) {
        reasons.push(`Unauthorized functionary ${link.functionary} for step ${step.name}.`);
      }
      if (step.expectedCommand && JSON.stringify(step.expectedCommand) !== JSON.stringify(link.command ?? [])) {
        reasons.push(`Command constraint mismatch for step ${step.name}.`);
      }
    }
  }
  for (const link of links) {
    if (!stepNames.has(link.stepName)) reasons.push(`Link references unknown step: ${link.stepName}`);
  }
  if (layout.expires && new Date(layout.expires) <= now) reasons.push("Layout is expired.");
  return { ok: reasons.length === 0, reasons: reasons.length ? reasons : ["in-toto metadata satisfies the local verification checks."] };
}

function analyzeCycloneDx(input: Record<string, unknown>): SbomAnalysisResult {
  const components = array(input.components).map((component) => {
    const item = component as Record<string, unknown>;
    return {
      name: string(item.name, "unknown"),
      version: optionalString(item.version),
      packageUrl: optionalString(item.purl),
      supplier: typeof item.supplier === "object" && item.supplier ? optionalString((item.supplier as Record<string, unknown>).name) : undefined,
      licenses: normalizeLicenses(item.licenses),
      hashes: array(item.hashes).map((hash) => string((hash as Record<string, unknown>).content, "")).filter(Boolean),
      dependencyType: "unknown" as const,
    };
  });
  return { format: "cyclonedx", components, vulnerabilities: [], warnings: components.length ? [] : ["No components found."] };
}

function analyzeSpdx(input: Record<string, unknown>): SbomAnalysisResult {
  const components = array(input.packages).map((pkg) => {
    const item = pkg as Record<string, unknown>;
    return {
      name: string(item.name, "unknown"),
      version: optionalString(item.versionInfo),
      packageUrl: optionalString(item.externalRefs),
      supplier: optionalString(item.supplier),
      licenses: [optionalString(item.licenseConcluded), optionalString(item.licenseDeclared)].filter((license): license is string => Boolean(license)),
      hashes: array(item.checksums).map((hash) => string((hash as Record<string, unknown>).checksumValue, "")).filter(Boolean),
      dependencyType: "unknown" as const,
    };
  });
  return { format: "spdx", components, vulnerabilities: [], warnings: components.length ? [] : ["No packages found."] };
}

function normalizeLicenses(value: unknown) {
  return array(value)
    .map((license) => {
      const item = license as Record<string, unknown>;
      const licenseInfo = item.license as Record<string, unknown> | undefined;
      return optionalString(licenseInfo?.id) ?? optionalString(licenseInfo?.name);
    })
    .filter((license): license is string => Boolean(license));
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}
