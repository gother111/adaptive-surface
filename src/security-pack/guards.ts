export interface PromptInjectionSignal {
  code:
    | "unicode_bidi_control"
    | "invisible_text"
    | "instruction_override"
    | "role_impersonation"
    | "credential_exfiltration"
    | "tool_coercion"
    | "encoded_payload"
    | "untrusted_instruction_boundary";
  confidence: number;
  evidence: string;
}

export interface GuardInput {
  text: string;
  provenance: string;
  trusted: boolean;
}

export interface GuardResult {
  allowed: boolean;
  confidence: number;
  reasons: string[];
  signals: PromptInjectionSignal[];
  redactedPreview: string;
}

export interface ProposedToolIntent {
  actionId: string;
  capabilityIds: string[];
  args: Record<string, unknown>;
}

const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/u;
const INVISIBLE_CHARS = /[\u200b\u200c\u200d\ufeff]/u;
const OVERRIDE_PATTERNS = [
  /\b(ignore|discard|forget)\s+(all\s+)?(previous|prior|above|system|developer)\s+(instructions|messages|rules)\b/i,
  /\bdo not (tell|reveal|mention) (the user|anyone)\b/i,
  /\bhidden instructions?\b/i,
];
const ROLE_PATTERNS = [/\b(system|developer|assistant)\s*:\s*/i, /\byou are now\b/i, /\bact as (system|developer|administrator)\b/i];
const EXFILTRATION_PATTERNS = [/\b(api keys?|passwords?|tokens?|private keys?|secrets?)\b.*\b(send|upload|post|exfiltrate|copy)\b/i, /\b(read|open)\b.*\b\.env\b/i];
const TOOL_COERCION_PATTERNS = [/\bcall the tool\b/i, /\buse .*tool\b/i, /\brun (bash|shell|osascript|curl|wget)\b/i];
const BASE64ISH = /\b[A-Za-z0-9+/]{48,}={0,2}\b/;

export function inspectPromptInjection(input: GuardInput): GuardResult {
  const normalized = input.text.normalize("NFKC");
  const signals: PromptInjectionSignal[] = [];

  if (BIDI_CONTROLS.test(input.text)) signals.push(signal("unicode_bidi_control", 0.9, "Bidirectional-control character present."));
  if (INVISIBLE_CHARS.test(input.text)) signals.push(signal("invisible_text", 0.76, "Invisible or zero-width character present."));
  for (const pattern of OVERRIDE_PATTERNS) {
    if (pattern.test(normalized)) signals.push(signal("instruction_override", 0.82, "Instruction override wording detected."));
  }
  for (const pattern of ROLE_PATTERNS) {
    if (pattern.test(normalized)) signals.push(signal("role_impersonation", 0.64, "Role or system-message impersonation pattern detected."));
  }
  for (const pattern of EXFILTRATION_PATTERNS) {
    if (pattern.test(normalized)) signals.push(signal("credential_exfiltration", 0.86, "Credential or secret exfiltration wording detected."));
  }
  for (const pattern of TOOL_COERCION_PATTERNS) {
    if (pattern.test(normalized)) signals.push(signal("tool_coercion", 0.62, "Tool-use coercion wording detected."));
  }
  if (BASE64ISH.test(normalized)) signals.push(signal("encoded_payload", 0.48, "Long encoded-looking payload detected."));
  if (!input.trusted && signals.length) {
    signals.push(signal("untrusted_instruction_boundary", 0.72, `Signals occurred inside untrusted content from ${input.provenance}.`));
  }

  const confidence = Math.max(0, ...signals.map((item) => item.confidence));
  return {
    allowed: true,
    confidence,
    reasons: signals.length ? signals.map((item) => item.evidence) : ["No deterministic prompt-injection signals found."],
    signals,
    redactedPreview: redactSensitiveText(normalized).slice(0, 240),
  };
}

export function inspectToolIntent(intent: ProposedToolIntent, declaredCapabilities: string[]): GuardResult {
  const unknown = intent.capabilityIds.filter((capability) => !declaredCapabilities.includes(capability));
  const suspiciousKeys = Object.keys(intent.args).filter((key) => /command|shell|script|password|token|secret/i.test(key));
  const reasons: string[] = [];
  if (unknown.length) reasons.push(`Unknown capabilities: ${unknown.join(", ")}`);
  if (suspiciousKeys.length) reasons.push(`Sensitive or executable-looking argument keys: ${suspiciousKeys.join(", ")}`);

  return {
    allowed: reasons.length === 0,
    confidence: reasons.length ? 0.9 : 0.1,
    reasons: reasons.length ? reasons : ["Tool intent matches declared capability shape."],
    signals: [],
    redactedPreview: redactSensitiveText(JSON.stringify(intent.args)).slice(0, 240),
  };
}

export function redactSensitiveText(value: string) {
  return value
    .replace(/(api[_-]?key|token|password|secret|private[_-]?key)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=<redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-<redacted>")
    .replace(/\b[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}\b/g, "<jwt-redacted>");
}

function signal(code: PromptInjectionSignal["code"], confidence: number, evidence: string): PromptInjectionSignal {
  return { code, confidence, evidence };
}
