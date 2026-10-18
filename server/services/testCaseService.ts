import { z } from "zod";
import type { Priority, TestCase } from "../types.js";
import { generateJson } from "./openaiService.js";

interface Input {
  requirement: string;
  feature: string;
  platform: "iOS" | "Android" | "Web";
  priority: Priority;
  count: number;
}

const testCaseSchema = z.object({
  testCases: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(5),
      type: z.enum(["Positive", "Negative", "Edge"]),
      priority: z.enum(["Low", "Medium", "High", "Critical"]),
      preconditions: z.string().min(3),
      steps: z.array(z.string().min(3)).min(2),
      expectedResult: z.string().min(5)
    })
  )
});

export async function generateTestCases(input: Input): Promise<TestCase[]> {
  const prompt = [
    "You are a senior QA engineer. Return only valid JSON.",
    `Create exactly ${input.count} ${input.platform} test cases for feature "${input.feature}".`,
    `Requirement: ${input.requirement}`,
    `Priority: ${input.priority}`,
    "Use this shape: {\"testCases\":[{\"id\":\"TC-001\",\"title\":\"...\",\"type\":\"Positive|Negative|Edge\",\"priority\":\"Low|Medium|High|Critical\",\"preconditions\":\"...\",\"steps\":[\"...\"],\"expectedResult\":\"...\"}]}",
    "Include positive, negative and edge coverage when count allows."
  ].join("\n");

  const aiResult = await generateJson<unknown>(prompt);
  const parsed = testCaseSchema.safeParse(aiResult);
  if (parsed.success && parsed.data.testCases.length === input.count) {
    return parsed.data.testCases;
  }

  return fallbackTestCases(input);
}

function fallbackTestCases(input: Input): TestCase[] {
  const types: TestCase["type"][] = ["Positive", "Negative", "Edge"];
  return Array.from({ length: input.count }, (_, index) => {
    const type = types[index % types.length];
    const id = `TC-${String(index + 1).padStart(3, "0")}`;
    return {
      id,
      title: `${type} validation for ${input.feature} on ${input.platform}`,
      type,
      priority: input.priority,
      preconditions: `User has access to the ${input.feature} flow on ${input.platform}.`,
      steps: [
        `Open the ${input.feature} screen.`,
        type === "Positive" ? "Enter valid inputs and submit." : "Enter boundary or invalid inputs and submit.",
        "Observe the result and any system message."
      ],
      expectedResult:
        type === "Positive"
          ? "The workflow completes successfully and the user sees the expected confirmation."
          : "The app handles the condition gracefully with clear feedback and no data loss."
    };
  });
}
