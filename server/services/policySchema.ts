import { z } from "zod";

export class PolicyError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export const driveFileId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);

export const policyQuestionInput = z.object({
  question: z.string().trim().min(4).max(2000),
  source: z.enum(["learn", "drive", "both"]).default("learn"),
  allowDocumentAI: z.boolean().default(false)
}).strict().superRefine((input, context) => {
  if (input.source !== "learn" && !input.allowDocumentAI) {
    context.addIssue({ code: "custom", message: "Consent to AI processing of documents in the configured public folder." });
  }
});

export interface PolicyDocument {
  title: string;
  fileName: string;
  sourceUrl?: string;
  kind: "learn" | "drive" | "local";
  text: string;
}
