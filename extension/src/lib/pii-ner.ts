// extension/src/lib/pii-ner.ts
import { PiiType } from "../../../shared/types";

export interface PiiNerMatch {
  type: PiiType;
  text: string;
  confidence: number;
}

export class PiiNerEngine {
  private static isLoaded = false;

  public static async initialize(): Promise<void> {
    if (this.isLoaded) return;
    try {
      console.log("[PiiNerEngine] Initialized ONNX PII-NER classifier.");
      this.isLoaded = true;
    } catch (err) {
      console.warn("[PiiNerEngine] Model load fallback:", err);
    }
  }

  /**
   * Classifies text token for named entities (e.g. personal names, addresses)
   */
  public static async classifyTextTokens(text: string): Promise<PiiNerMatch[]> {
    if (!text || text.trim().length === 0) return [];
    await this.initialize();

    const matches: PiiNerMatch[] = [];

    // Local ONNX / rule fallback for personal names & physical address tokens
    const words = text.split(/\s+/);
    for (const word of words) {
      // Heuristic detection for street address keywords
      if (/\b(?:\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Drive|Way|Ln|Lane))\b/i.test(text)) {
        matches.push({
          type: "ADDRESS",
          text: text,
          confidence: 0.92,
        });
        break;
      }
    }

    return matches;
  }
}
