// extension/src/offscreen/offscreen.ts
import { LocalPrivacyEngine } from "../lib/privacy-engine";
import { FaceEngine } from "../lib/face-engine";
import { VisionEngine } from "../lib/vision-engine";
import { PiiNerEngine } from "../lib/pii-ner";
import { SanitizedContext, SanitizedElement, RedactionDecision, PiiType } from "../../../shared/types";

export async function processScreenshotAndRedact(payload: {
  taskId: string;
  stepIndex: number;
  screenshotRaw: string;
  elements: SanitizedElement[];
  viewport: { w: number; h: number; devicePixelRatio: number };
  redactionMode?: "blackout" | "blur";
}): Promise<{
  sanitizedContext: SanitizedContext;
  decisions: RedactionDecision[];
}> {
  const { taskId, stepIndex, screenshotRaw, elements, viewport, redactionMode = "blackout" } = payload;

  // 1. Sanitize text and apply DOM heuristics
  const { sanitized: textSanitizedElements, decisions: textDecisions } = LocalPrivacyEngine.sanitizeElements(elements);

  // 2. Load screenshot image into canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const img = new Image();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = (e) => reject(e);
    img.src = screenshotRaw;
  });

  const allDecisions: RedactionDecision[] = [...textDecisions];

  // 3. Face Detection via FaceEngine
  const detectedFaces = await FaceEngine.detectFaces(canvas);
  for (const face of detectedFaces) {
    allDecisions.push({
      type: "FACE",
      detector: "blazeface",
      confidence: face.confidence,
      bbox: face.bbox,
      reason: "BlazeFace detected visual human face area",
    });
  }

  // 4. Run ViT / Screen Analysis
  const { caption } = await VisionEngine.analyzeScreen(canvas, textSanitizedElements);

  // 5. Gather pixel redaction boxes
  const redactionBoxes: { bbox: [number, number, number, number]; label: PiiType }[] = [];

  // Add face bboxes
  for (const face of detectedFaces) {
    redactionBoxes.push({ bbox: face.bbox, label: "FACE" });
  }

  // Add element bboxes for elements flagged as redacted
  for (const el of textSanitizedElements) {
    if (el.redacted) {
      const decision = allDecisions.find((d) => d.bbox === el.bbox) || { type: "PASSWORD" as PiiType };
      redactionBoxes.push({ bbox: el.bbox, label: decision.type });
    }
  }

  // 6. Draw pixel redactions on offscreen canvas
  LocalPrivacyEngine.redactCanvasPixels(canvas, redactionBoxes, redactionMode);
  const redactedScreenshotDataUrl = canvas.toDataURL("image/png");

  // 7. Compute redaction summary breakdown counts
  const countMap = new Map<PiiType, number>();
  for (const d of allDecisions) {
    countMap.set(d.type, (countMap.get(d.type) || 0) + 1);
  }

  const redactionSummary = Array.from(countMap.entries()).map(([type, count]) => ({
    type,
    count,
  }));

  const sanitizedContext: SanitizedContext = {
    taskId,
    stepIndex,
    screenshot: redactedScreenshotDataUrl,
    elements: textSanitizedElements,
    screenCaption: caption,
    redactionSummary,
    viewport,
  };

  return { sanitizedContext, decisions: allDecisions };
}

// Runtime message listener for Chrome background worker requests
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target === "offscreen" && message.action === "PROCESS_REDACTION") {
      processScreenshotAndRedact(message.payload)
        .then((result) => sendResponse({ success: true, ...result }))
        .catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;
    }
  });
}
