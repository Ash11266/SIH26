// shared/types.ts

export type PiiType =
  | "EMAIL"
  | "PHONE"
  | "CARD"
  | "SSN"
  | "IP"
  | "API_KEY"
  | "IBAN"
  | "PASSWORD"
  | "FACE"
  | "NAME"
  | "ADDRESS"
  | "CUSTOM";

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SanitizedElement {
  id: string; // Injected data-agent-id (matches Set-of-Marks badge number e.g. "1", "2")
  role: string; // "button" | "input" | "link" | "text" | "select" | "checkbox" | "other"
  bbox: [number, number, number, number]; // [x, y, w, h] in physical pixels
  text: string; // Sanitized string (e.g. "[REDACTED:EMAIL]" or public text)
  redacted: boolean;
  attrs: {
    type?: string;
    placeholder?: string;
    ariaLabel?: string;
    name?: string;
    href?: string;
    value?: string;
  };
}

export interface RedactionDecision {
  type: PiiType;
  detector: "regex" | "luhn" | "dom" | "blazeface" | "ner" | "vit";
  confidence: number;
  bbox?: [number, number, number, number]; // Physical pixels if visual
  originalSubstring?: string; // Stored locally only, never serialized to network payload
  reason: string;
}

export interface RedactionSummaryItem {
  type: PiiType;
  count: number;
}

export interface SanitizedContext {
  taskId: string;
  stepIndex: number;
  screenshot: string; // Base64 PNG/WebP, ALREADY pixel-redacted
  elements: SanitizedElement[];
  screenCaption: string; // Local ViT high-level context summary
  redactionSummary: RedactionSummaryItem[];
  viewport: {
    w: number;
    h: number;
    devicePixelRatio: number;
  };
}

export type ActionType =
  | "click"
  | "type"
  | "scroll"
  | "navigate"
  | "wait"
  | "done";

export interface AgentAction {
  type: ActionType;
  targetId?: string; // References SanitizedElement.id (badge number)
  value?: string; // Text to type, URL to navigate, or scroll distance in px
  reasoning: string;
  done: boolean;
  confidence: number;
}

export interface StepHistoryItem {
  stepIndex: number;
  action: AgentAction;
  redactionCount: number;
  timestamp: number;
}

export interface AgentStepRequest {
  task: string;
  context: SanitizedContext;
  history: StepHistoryItem[];
  sharedSecret?: string;
}

export interface AgentStepResponse {
  success: boolean;
  action?: AgentAction;
  error?: string;
  latencyMs?: {
    total: number;
    serverLlmMs: number;
    validationMs: number;
  };
}

export interface EvaluationMetric {
  visualContextAccuracy: number; // IoU >= 0.5 matching precision/recall F1 (25%)
  piiPrecision: number; // PII detection precision (20%)
  piiRecall: number; // PII detection recall (20%)
  redactionPrecision: number; // True PII / Total Redacted (20%)
  leakageRate: number; // Unredacted PII / Total PII
  overRedactionRate: number; // Non-PII redacted / Total non-PII
  avgClientMemoryMb: number; // Client resource usage (20%)
  avgLocalInferenceMs: number;
  avgEndToEndLatencyMs: number; // End-to-end latency (15%)
  compositeScore: number; // Final weighted score
}
