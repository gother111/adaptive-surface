export type ThreatFramework = "STRIDE" | "LINDDUN";

export interface ThreatModelEntity {
  id: string;
  type: "asset" | "actor" | "process" | "data_store" | "external_entity";
  name: string;
  confirmed: boolean;
  privileges?: string[];
  dataClassifications?: string[];
}

export interface ThreatModelFlow {
  id: string;
  from: string;
  to: string;
  label: string;
  protocol?: string;
  crossesTrustBoundary: boolean;
  dataClassifications: string[];
  confirmed: boolean;
}

export interface TrustBoundary {
  id: string;
  name: string;
  entityIds: string[];
}

export interface ThreatRecord {
  id: string;
  framework: ThreatFramework;
  category: string;
  title: string;
  affectedFlowId?: string;
  affectedEntityId?: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  riskScore: number;
  mitigation: string;
  residualRisk: "unknown" | "low" | "medium" | "high";
  evidence: string[];
  status: "open" | "mitigated" | "accepted";
}

export interface FlowSurfaceThreatModel {
  modelId: string;
  version: 1;
  target: string;
  scope: string;
  assumptions: string[];
  entities: ThreatModelEntity[];
  flows: ThreatModelFlow[];
  trustBoundaries: TrustBoundary[];
  entryPoints: string[];
  threats: ThreatRecord[];
  verificationTasks: string[];
  sourceProvenance: string[];
}

export function createInitialThreatModel(input: {
  modelId: string;
  target: string;
  scope: string;
  assumptions?: string[];
  entities?: ThreatModelEntity[];
  flows?: ThreatModelFlow[];
  trustBoundaries?: TrustBoundary[];
  sourceProvenance?: string[];
}): FlowSurfaceThreatModel {
  const model: FlowSurfaceThreatModel = {
    modelId: input.modelId,
    version: 1,
    target: input.target,
    scope: input.scope,
    assumptions: input.assumptions ?? ["Architecture details not explicitly provided are marked as inferred."],
    entities: input.entities ?? [],
    flows: input.flows ?? [],
    trustBoundaries: input.trustBoundaries ?? [],
    entryPoints: input.flows?.filter((flow) => flow.crossesTrustBoundary).map((flow) => flow.id) ?? [],
    threats: [],
    verificationTasks: [],
    sourceProvenance: input.sourceProvenance ?? ["user_utterance"],
  };
  return recalculateThreats(model);
}

export function recalculateThreats(model: FlowSurfaceThreatModel): FlowSurfaceThreatModel {
  const threats: ThreatRecord[] = [];

  for (const flow of model.flows) {
    if (flow.crossesTrustBoundary) {
      threats.push(threat("STRIDE", "Spoofing", "Authenticate cross-boundary caller identity", flow, 3, 4, "Require authenticated identity and replay protection."));
      threats.push(threat("STRIDE", "Tampering", "Protect cross-boundary data integrity", flow, 3, 4, "Validate schema, sign critical payloads, and reject unexpected fields."));
      threats.push(threat("STRIDE", "Information Disclosure", "Limit sensitive data crossing trust boundary", flow, 3, flow.dataClassifications.length ? 5 : 3, "Redact, minimize, and log only metadata."));
    }

    if (flow.dataClassifications.some((classification) => /personal|private|sensitive/i.test(classification))) {
      threats.push(threat("LINDDUN", "Linkability", "Prevent privacy linkage across contexts", flow, 2, 4, "Minimize identifiers and define retention limits."));
    }

    if (/model|llm|agent|mcp|tool/i.test(flow.label)) {
      threats.push(threat("STRIDE", "Elevation of Privilege", "Prevent prompt or tool poisoning from granting capabilities", flow, 3, 5, "Keep model output behind typed policy preflight and approvals."));
    }
  }

  for (const entity of model.entities) {
    if (entity.privileges?.some((privilege) => /admin|write|token|secret/i.test(privilege))) {
      threats.push(entityThreat(entity, "STRIDE", "Elevation of Privilege", "Review excessive privileges", 3, 5, "Reduce privilege scope and require approval for mutations."));
    }
  }

  const verificationTasks = Array.from(new Set(threats.map((item) => `Verify mitigation: ${item.mitigation}`)));
  return { ...model, threats, verificationTasks };
}

function threat(
  framework: ThreatFramework,
  category: string,
  title: string,
  flow: ThreatModelFlow,
  likelihood: ThreatRecord["likelihood"],
  impact: ThreatRecord["impact"],
  mitigation: string,
): ThreatRecord {
  return {
    id: `${flow.id}:${framework}:${category}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    framework,
    category,
    title,
    affectedFlowId: flow.id,
    likelihood,
    impact,
    riskScore: likelihood * impact,
    mitigation,
    residualRisk: "unknown",
    evidence: [flow.confirmed ? "confirmed_flow" : "inferred_flow"],
    status: "open",
  };
}

function entityThreat(
  entity: ThreatModelEntity,
  framework: ThreatFramework,
  category: string,
  title: string,
  likelihood: ThreatRecord["likelihood"],
  impact: ThreatRecord["impact"],
  mitigation: string,
): ThreatRecord {
  return {
    id: `${entity.id}:${framework}:${category}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    framework,
    category,
    title,
    affectedEntityId: entity.id,
    likelihood,
    impact,
    riskScore: likelihood * impact,
    mitigation,
    residualRisk: "unknown",
    evidence: [entity.confirmed ? "confirmed_entity" : "inferred_entity"],
    status: "open",
  };
}
