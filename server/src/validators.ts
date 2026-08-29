// server/src/validators.ts
import { z } from "zod";

export const SanitizedElementSchema = z.object({
  id: z.string(),
  role: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  text: z.string(),
  redacted: z.boolean(),
  attrs: z.object({
    type: z.string().optional(),
    placeholder: z.string().optional(),
    ariaLabel: z.string().optional(),
    name: z.string().optional(),
    href: z.string().optional(),
    value: z.string().optional(),
  }),
});

export const SanitizedContextSchema = z.object({
  taskId: z.string(),
  stepIndex: z.number(),
  screenshot: z.string(),
  elements: z.array(SanitizedElementSchema),
  screenCaption: z.string().optional().default(""),
  redactionSummary: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
    })
  ),
  viewport: z.object({
    w: z.number(),
    h: z.number(),
    devicePixelRatio: z.number(),
  }),
});

export const AgentActionSchema = z.object({
  type: z.enum(["click", "type", "scroll", "navigate", "wait", "done"]),
  targetId: z.string().optional(),
  value: z.string().optional(),
  reasoning: z.string(),
  done: z.boolean(),
  confidence: z.number(),
});

export const AgentStepRequestSchema = z.object({
  task: z.string().min(1),
  context: SanitizedContextSchema,
  history: z.array(
    z.object({
      stepIndex: z.number(),
      action: AgentActionSchema,
      redactionCount: z.number(),
      timestamp: z.number(),
    })
  ),
  sharedSecret: z.string().optional(),
});

export function validateActionTarget(action: z.infer<typeof AgentActionSchema>, elements: z.infer<typeof SanitizedElementSchema>[]): { valid: boolean; error?: string } {
  if (action.type === "click" || action.type === "type") {
    if (!action.targetId) {
      return { valid: false, error: `Action '${action.type}' requires targetId` };
    }
    const exists = elements.some((el) => el.id === action.targetId);
    if (!exists) {
      const validIds = elements.map((e) => e.id).join(", ");
      return {
        valid: false,
        error: `targetId '${action.targetId}' does not exist in elements list. Valid IDs: [${validIds}]`,
      };
    }
  }
  return { valid: true };
}
