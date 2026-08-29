// extension/src/lib/privacy-engine.ts
import { PiiType, RedactionDecision, SanitizedElement } from "../../../shared/types";

// Luhn algorithm check for credit/debit card numbers
export function isValidLuhn(cardNumberStr: string): boolean {
  const clean = cardNumberStr.replace(/\D/g, "");
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// REGEX BANK FOR PII DETECTION
export const PII_REGEX_BANK: { type: PiiType; regex: RegExp; validator?: (val: string) => boolean }[] = [
  {
    type: "EMAIL",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: "CARD",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    validator: isValidLuhn,
  },
  {
    type: "PHONE",
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  },
  {
    type: "SSN",
    regex: /\b(?:\d{3}-\d{2}-\d{4}|\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/g, // Covers SSN and 12-digit Aadhaar style IDs
  },
  {
    type: "API_KEY",
    regex: /\b(?:mock_api_key_[0-9a-zA-Z]{10,40}|sk_live_[0-9a-zA-Z]{24}|sk_test_[0-9a-zA-Z]{24}|AIza[0-9A-Za-z-_]{35}|bearer\s+[A-Za-z0-9\-._~+/]+=*)\b/gi,
  },
  {
    type: "IP",
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  },
  {
    type: "IBAN",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },
];

// DOM HEURISTICS PATTERNS
const SENSITIVE_DOM_PATTERNS = /ssn|card|cvv|password|otp|secret|pin|creditcard|account_number|security_code/i;

export class LocalPrivacyEngine {
  /**
   * Evaluates text string against Regex Bank
   */
  public static detectPiiInText(text: string): { type: PiiType; match: string }[] {
    const findings: { type: PiiType; match: string }[] = [];
    if (!text || typeof text !== "string") return findings;

    for (const item of PII_REGEX_BANK) {
      // Reset regex index
      item.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = item.regex.exec(text)) !== null) {
        const matchedStr = match[0];
        if (!item.validator || item.validator(matchedStr)) {
          findings.push({ type: item.type, match: matchedStr });
        }
      }
    }

    return findings;
  }

  /**
   * DOM Heuristics Check on Element attributes
   */
  public static isDOMElementSensitive(element: {
    role: string;
    attrs: { type?: string; placeholder?: string; ariaLabel?: string; name?: string; href?: string; value?: string };
  }): { isSensitive: boolean; piiType: PiiType; reason: string } {
    const { attrs } = element;

    // Check input type
    if (attrs.type === "password") {
      return { isSensitive: true, piiType: "PASSWORD", reason: 'input[type="password"]' };
    }

    const combinedAttrStr = `${attrs.name || ""} ${attrs.placeholder || ""} ${attrs.ariaLabel || ""} ${attrs.type || ""}`;
    if (SENSITIVE_DOM_PATTERNS.test(combinedAttrStr)) {
      if (/card|creditcard|cvv/i.test(combinedAttrStr)) {
        return { isSensitive: true, piiType: "CARD", reason: `Attribute matched sensitive pattern: ${combinedAttrStr}` };
      }
      if (/password|otp|pin|secret/i.test(combinedAttrStr)) {
        return { isSensitive: true, piiType: "PASSWORD", reason: `Attribute matched sensitive pattern: ${combinedAttrStr}` };
      }
      if (/ssn/i.test(combinedAttrStr)) {
        return { isSensitive: true, piiType: "SSN", reason: `Attribute matched sensitive pattern: ${combinedAttrStr}` };
      }
      return { isSensitive: true, piiType: "CUSTOM", reason: `Attribute matched sensitive pattern: ${combinedAttrStr}` };
    }

    return { isSensitive: false, piiType: "CUSTOM", reason: "" };
  }

  /**
   * Sanitizes an array of DOM elements (redacting PII in text strings and metadata)
   */
  public static sanitizeElements(elements: SanitizedElement[]): {
    sanitized: SanitizedElement[];
    decisions: RedactionDecision[];
  } {
    const decisions: RedactionDecision[] = [];

    const sanitized = elements.map((el) => {
      let currentText = el.text || "";
      let isRedacted = el.redacted || false;

      // 1. DOM Heuristics Check
      const domCheck = this.isDOMElementSensitive(el);
      if (domCheck.isSensitive) {
        isRedacted = true;
        decisions.push({
          type: domCheck.piiType,
          detector: "dom",
          confidence: 1.0,
          bbox: el.bbox,
          originalSubstring: currentText || el.attrs.value,
          reason: domCheck.reason,
        });
        currentText = `[REDACTED:${domCheck.piiType}]`;
      }

      // 2. Text Regex Check
      const piiMatches = this.detectPiiInText(currentText);
      for (const m of piiMatches) {
        isRedacted = true;
        currentText = currentText.replace(m.match, `[REDACTED:${m.type}]`);
        decisions.push({
          type: m.type,
          detector: "regex",
          confidence: 0.99,
          bbox: el.bbox,
          originalSubstring: m.match,
          reason: `Regex pattern match for ${m.type}`,
        });
      }

      return {
        ...el,
        text: currentText,
        redacted: isRedacted,
      };
    });

    return { sanitized, decisions };
  }

  /**
   * Offscreen Canvas Pixel Redaction (solid black rectangle or blur)
   */
  public static redactCanvasPixels(
    canvas: HTMLCanvasElement,
    boxes: { bbox: [number, number, number, number]; label?: PiiType }[],
    mode: "blackout" | "blur" = "blackout"
  ): HTMLCanvasElement {
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    for (const item of boxes) {
      const [x, y, w, h] = item.bbox;
      if (w <= 0 || h <= 0) continue;

      if (mode === "blur") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.filter = "blur(20px)";
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
      } else {
        // Default solid blackout rectangle
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y, w, h);

        // Optional small label overlay for debugging/demo visual clarity
        if (item.label) {
          ctx.fillStyle = "#FF0055";
          ctx.font = "bold 12px sans-serif";
          ctx.fillText(`[REDACTED:${item.label}]`, x + 4, Math.max(y + 14, 14));
        }
      }
    }

    return canvas;
  }
}
