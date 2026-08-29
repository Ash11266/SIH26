// server/src/gemini-client.ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { AgentAction, SanitizedContext, StepHistoryItem } from "../../shared/types";
import { AgentActionSchema, validateActionTarget } from "./validators";

const GEMINI_SYSTEM_PROMPT = `You are a browser automation agent. You receive a SCREENSHOT and a JSON tree of on-screen elements. Every interactive element is marked in the image with a small numbered badge; that number is its targetId and also appears as the id field in the JSON element list — the two always match. Valid targetId values for this step are strictly provided in the prompt; never invent an ID outside this set.

IMPORTANT: for privacy reasons, some regions of the screenshot appear as solid black/blurred boxes, and some element text fields contain tokens like [REDACTED:EMAIL], [REDACTED:CARD], [REDACTED:PASSWORD], etc. instead of real values. This is intentional and expected — treat a redacted box as 'a field/region of type X exists here' without needing its content to plan the next UI action. Never ask the user to reveal redacted content.

Given the user's TASK and the STEP HISTORY, return exactly one JSON action object matching the schema: click, type, scroll, navigate, wait, or done. Respond with raw JSON only.`;

const ACTION_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      enum: ["click", "type", "scroll", "navigate", "wait", "done"],
    },
    targetId: { type: SchemaType.STRING },
    value: { type: SchemaType.STRING },
    reasoning: { type: SchemaType.STRING },
    done: { type: SchemaType.BOOLEAN },
    confidence: { type: SchemaType.NUMBER },
  },
  required: ["type", "reasoning", "done", "confidence"],
};

export async function getNextAgentAction(
  task: string,
  context: SanitizedContext,
  history: StepHistoryItem[]
): Promise<{ action: AgentAction; latencyMs: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const startTime = Date.now();

  // Handle mock mode if no valid API key is set
  if (!apiKey || apiKey === "mock_key_for_testing" || apiKey === "your_gemini_api_key_here") {
    const mockAction = generateMockAction(task, context, history);
    return {
      action: mockAction,
      latencyMs: Date.now() - startTime,
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: GEMINI_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ACTION_RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  });

  const validIds = context.elements.map((e) => e.id);
  const promptText = `
TASK: "${task}"
CURRENT STEP: ${context.stepIndex}
ELEMENTS COUNT (N): ${context.elements.length}
VALID targetId VALUES: [${validIds.join(", ")}]

ON-SCREEN ELEMENTS (SANITZED):
${JSON.stringify(
  context.elements.map((e) => ({
    id: e.id,
    role: e.role,
    text: e.text,
    redacted: e.redacted,
    attrs: e.attrs,
  })),
  null,
  2
)}

REDACTION SUMMARY:
${JSON.stringify(context.redactionSummary)}

STEP HISTORY:
${JSON.stringify(
  history.map((h) => ({
    step: h.stepIndex,
    type: h.action.type,
    targetId: h.action.targetId,
    reasoning: h.action.reasoning,
  }))
)}
`;

  // Prepare image part if screenshot is present
  const inlineParts: any[] = [{ text: promptText }];
  if (context.screenshot && context.screenshot.includes(",")) {
    const base64Data = context.screenshot.split(",")[1];
    const mimeType = context.screenshot.split(";")[0].split(":")[1] || "image/png";
    inlineParts.push({
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    });
  }

  try {
    const result = await model.generateContent(inlineParts);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);
    const validated = AgentActionSchema.parse(parsed);

    // Validate targetId boundary check
    const targetCheck = validateActionTarget(validated, context.elements);
    if (!targetCheck.valid) {
      console.warn(`[Gemini Validation Warning] ${targetCheck.error}. Retrying prompt once...`);
      // Retry once with explicit boundary warning
      const retryResult = await model.generateContent([
        ...inlineParts,
        {
          text: `ERROR IN PREVIOUS OUTPUT: ${targetCheck.error}. You MUST pick targetId strictly from [${validIds.join(
            ", "
          )}].`,
        },
      ]);
      const retryParsed = JSON.parse(retryResult.response.text());
      const retryAction = AgentActionSchema.parse(retryParsed);
      return { action: retryAction as AgentAction, latencyMs: Date.now() - startTime };
    }

    return { action: validated as AgentAction, latencyMs: Date.now() - startTime };
  } catch (err: any) {
    console.error("[Gemini Error]", err);
    // Safe fallback action if model API fails or errors
    const fallback = generateMockAction(task, context, history);
    fallback.reasoning = `Fallback execution due to API error: ${err.message || err}`;
    return { action: fallback, latencyMs: Date.now() - startTime };
  }
}

function generateMockAction(
  task: string,
  context: SanitizedContext,
  history: StepHistoryItem[]
): AgentAction {
  const interactive = context.elements.filter(
    (e) => e.role === "button" || e.role === "input" || e.role === "link" || e.role === "select"
  );

  if (history.length >= 10 || interactive.length === 0) {
    return {
      type: "done",
      reasoning: "Task completed successfully or step limit reached.",
      done: true,
      confidence: 0.95,
    };
  }

  // Find unhandled input or button
  const nextTarget = interactive[history.length % interactive.length];
  if (nextTarget.role === "input") {
    return {
      type: "type",
      targetId: nextTarget.id,
      value: "Sample Input",
      reasoning: `Filling input field badge #${nextTarget.id} safely (PII redacted locally).`,
      done: false,
      confidence: 0.9,
    };
  }

  return {
    type: "click",
    targetId: nextTarget.id,
    reasoning: `Clicking interactive element badge #${nextTarget.id} to proceed with task.`,
    done: false,
    confidence: 0.9,
  };
}
