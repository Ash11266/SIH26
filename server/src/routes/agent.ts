// server/src/routes/agent.ts
import { Router, Request, Response } from "express";
import { AgentStepRequestSchema } from "../validators";
import { getNextAgentAction } from "../gemini-client";
import { AgentStepResponse } from "../../../shared/types";

const router = Router();

router.post("/step", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const parseResult = AgentStepRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const response: AgentStepResponse = {
        success: false,
        error: `Invalid request payload: ${parseResult.error.errors.map((e) => e.message).join("; ")}`,
      };
      return res.status(400).json(response);
    }

    const { task, context, history, sharedSecret } = parseResult.data;

    // Verify sharedSecret if server environment defines one
    const expectedSecret = process.env.SHARED_SECRET;
    if (expectedSecret && sharedSecret && sharedSecret !== expectedSecret) {
      const response: AgentStepResponse = {
        success: false,
        error: "Unauthorized: Invalid shared secret header/token",
      };
      return res.status(401).json(response);
    }

    console.log(
      `[Agent Step] Task: "${task}" | Step: ${context.stepIndex} | Elements: ${context.elements.length} | Redactions: ${context.redactionSummary.map((r) => `${r.type}:${r.count}`).join(", ") || "none"}`
    );

    const { action, latencyMs: llmMs } = await getNextAgentAction(task, context as any, history as any);

    const totalLatencyMs = Date.now() - startTime;
    const response: AgentStepResponse = {
      success: true,
      action,
      latencyMs: {
        total: totalLatencyMs,
        serverLlmMs: llmMs,
        validationMs: totalLatencyMs - llmMs,
      },
    };

    return res.json(response);
  } catch (err: any) {
    console.error("[Agent Route Error]", err);
    const response: AgentStepResponse = {
      success: false,
      error: `Server internal error: ${err.message || err}`,
    };
    return res.status(500).json(response);
  }
});

export default router;
