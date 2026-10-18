import { z } from "zod";
import type { BugDraft, Priority } from "../types.js";
import { generateJson } from "./openaiService.js";

interface Input {
  requirement: string;
  summary: string;
  environment: string;
  version: string;
  occurrence: string;
  severity: Priority;
  priority: Priority;
}

const bugSchema = z.object({
  title: z.string().min(5),
  requirement: z.string().min(3),
  summary: z.string().min(5),
  environment: z.string().min(2),
  version: z.string().min(1),
  occurrence: z.string().min(2),
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  stepsToReproduce: z.array(z.string().min(3)).min(2),
  expectedBehavior: z.string().min(5),
  actualBehavior: z.string().min(5),
  tags: z.array(z.string()).min(1),
  humanApprovalRequired: z.literal(true)
});

export async function draftBug(input: Input): Promise<BugDraft> {
  const prompt = [
    "You are a bug triage assistant. Return only valid JSON.",
    "Draft a complete defect report. The report is a draft and must require human approval.",
    `Requirement: ${input.requirement}`,
    `Summary: ${input.summary}`,
    `Environment: ${input.environment}`,
    `Version: ${input.version}`,
    `Occurrence: ${input.occurrence}`,
    `Severity: ${input.severity}`,
    `Priority: ${input.priority}`,
    "Shape: {\"title\":\"...\",\"requirement\":\"...\",\"summary\":\"...\",\"environment\":\"...\",\"version\":\"...\",\"occurrence\":\"...\",\"severity\":\"...\",\"priority\":\"...\",\"stepsToReproduce\":[\"...\"],\"expectedBehavior\":\"...\",\"actualBehavior\":\"...\",\"tags\":[\"...\"],\"humanApprovalRequired\":true}"
  ].join("\n");

  const aiResult = await generateJson<unknown>(prompt);
  const parsed = bugSchema.safeParse(aiResult);
  if (parsed.success) return parsed.data;

  return {
    title: `[${input.environment}] ${input.summary}`,
    requirement: input.requirement,
    summary: input.summary,
    environment: input.environment,
    version: input.version,
    occurrence: input.occurrence,
    severity: input.severity,
    priority: input.priority,
    stepsToReproduce: [
      "Open the affected build in the stated environment.",
      "Navigate to the workflow connected to the requirement.",
      "Repeat the reported action until the issue appears."
    ],
    expectedBehavior: "The workflow should satisfy the requirement without interruption or incorrect output.",
    actualBehavior: input.summary,
    tags: ["qa-draft", input.environment.toLowerCase().replace(/\s+/g, "-"), input.severity.toLowerCase()],
    humanApprovalRequired: true
  };
}
