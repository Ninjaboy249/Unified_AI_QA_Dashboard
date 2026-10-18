import cors from "cors";
import express from "express";
import { loadEnvFile } from "node:process";
import { z } from "zod";
import { routeIntent } from "./services/assistantService.js";
import { draftBug } from "./services/bugService.js";
import { searchDirectory } from "./services/directoryService.js";
import { activity, metrics } from "./services/metricsService.js";
import { getOpenAIHealth } from "./services/openaiService.js";
import { answerPolicyQuestion, listKnowledgeSources } from "./services/policyService.js";
import { generateTestCases } from "./services/testCaseService.js";

try {
  loadEnvFile();
} catch {
  // Vercel and most production hosts provide environment variables directly.
}

export const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "1mb" }));

const testCaseInput = z.object({
  requirement: z.string().min(8),
  feature: z.string().min(2),
  platform: z.enum(["iOS", "Android", "Web"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  count: z.number().int().min(1).max(8)
});

const bugInput = z.object({
  requirement: z.string().min(5),
  summary: z.string().min(5),
  environment: z.string().min(2),
  version: z.string().min(1),
  occurrence: z.string().min(2),
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"])
});

const questionInput = z.object({ question: z.string().min(4) });
const intentInput = z.object({ intent: z.string().min(3) });

app.get("/api/health", async (_req, res, next) => {
  try {
    res.json(await getOpenAIHealth());
  } catch (error) {
    next(error);
  }
});

app.get("/api/metrics", (_req, res) => res.json(metrics));
app.get("/api/activity", (_req, res) => res.json(activity));

app.post("/api/test-cases/generate", async (req, res, next) => {
  try {
    const input = testCaseInput.parse(req.body);
    res.json({ testCases: await generateTestCases(input) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/bugs/draft", async (req, res, next) => {
  try {
    const input = bugInput.parse(req.body);
    res.json({ bug: await draftBug(input) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/directory/search", (req, res) => {
  res.json({ records: searchDirectory(String(req.query.q ?? "")) });
});

app.post("/api/policy/ask", async (req, res, next) => {
  try {
    const input = questionInput.parse(req.body);
    res.json(await answerPolicyQuestion(input.question));
  } catch (error) {
    next(error);
  }
});

app.post("/api/assistant/route", (req, res, next) => {
  try {
    const input = intentInput.parse(req.body);
    res.json(routeIntent(input.intent));
  } catch (error) {
    next(error);
  }
});

app.get("/api/knowledge/sources", (_req, res, next) => {
  try {
    res.json({ sources: listKnowledgeSources() });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Request failed validation.", details: error.issues });
  }
  return res.status(500).json({ message: "The operation could not be completed safely." });
});

export default app;
