import cors from "cors";
import express from "express";
import { loadEnvFile } from "node:process";
import { z } from "zod";
import { routeIntent } from "./services/assistantService.js";
import { draftBug } from "./services/bugService.js";
import { planDirectoryChanges, saveDirectoryChanges, searchDirectory } from "./services/directoryService.js";
import { changeRequest, DirectoryError } from "./services/directorySchema.js";
import { activity, metrics } from "./services/metricsService.js";
import { getOpenAIHealth } from "./services/openaiService.js";
import { answerPolicyQuestion, listKnowledgeSources } from "./services/policyService.js";
import { generateTestCases } from "./services/testCaseService.js";
import { documentInput, extractRequirements } from "./services/requirementService.js";
import { planPolicySetup, portalId } from "./services/policySetupService.js";
import { closePolicyLogin, isAuthorizedLocalRequest, startPolicyLogin } from "./services/policyLoginService.js";
import {
  AuthError, getSessionAccount, isAccountStoreConfigured, listAccounts, readSessionCookie, sessionCookie, signIn, signOut
} from "./services/accountService.js";
import {
  createTestAccount, deleteTestAccount, listTestAccounts, revealTestAccountPassword, rings, testAccountInput, updateTestAccount
} from "./services/testAccountService.js";

try {
  loadEnvFile();
} catch {
  // Vercel and most production hosts provide environment variables directly.
}

export const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "8mb" }));

const testCaseInput = z.object({
  requirement: z.string().min(8).max(60_000),
  feature: z.string().min(2).max(200),
  platform: z.enum(["iOS", "Android"]),
  includeScreenshots: z.boolean().default(false),
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

const isSecureRequest = (req: express.Request) => req.secure || req.headers["x-forwarded-proto"] === "https";

app.post("/api/auth/login", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const input = z.object({ username: z.string().trim().min(1).max(254), password: z.string().min(1).max(1024) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ message: "Enter a username and password." });
  try {
    const { token, account } = await signIn(input.data.username, input.data.password, req.ip ?? "unknown");
    res.setHeader("Set-Cookie", sessionCookie(token, isSecureRequest(req)));
    res.json({ account });
  } catch (error) {
    next(error);
  } finally {
    if (req.body && typeof req.body === "object") delete req.body.password;
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await signOut(readSessionCookie(req.headers.cookie));
    res.setHeader("Set-Cookie", sessionCookie("", isSecureRequest(req), 0));
    res.json({ message: "Signed out." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json({ configured: isAccountStoreConfigured(), account: await getSessionAccount(readSessionCookie(req.headers.cookie)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/account", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const account = await getSessionAccount(readSessionCookie(req.headers.cookie));
    if (!account) return res.status(401).json({ message: "Sign in with an admin or dev account to view this page." });
    res.json({ account, accounts: account.role === "admin" ? await listAccounts() : undefined });
  } catch (error) {
    next(error);
  }
});

app.get("/api/metrics", (_req, res) => res.json(metrics));

async function requireAccount(req: express.Request, res: express.Response) {
  res.setHeader("Cache-Control", "no-store");
  const account = await getSessionAccount(readSessionCookie(req.headers.cookie));
  if (!account) res.status(401).json({ message: "Sign in with an admin or dev account to manage test accounts." });
  return account;
}

const accountId = z.uuid();

app.get("/api/test-accounts", async (req, res, next) => {
  try {
    if (!await requireAccount(req, res)) return;
    res.json({ rings, accounts: await listTestAccounts() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/test-accounts", async (req, res, next) => {
  try {
    const account = await requireAccount(req, res);
    if (!account) return;
    const input = testAccountInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Choose a ring and enter a valid email username, password and optional notes (500 characters max)." });
    res.status(201).json({ account: await createTestAccount(input.data, account.username) });
  } catch (error) {
    next(error);
  } finally {
    if (req.body && typeof req.body === "object") delete req.body.password;
  }
});

app.put("/api/test-accounts/:id", async (req, res, next) => {
  try {
    const account = await requireAccount(req, res);
    if (!account) return;
    const id = accountId.safeParse(req.params.id);
    const input = testAccountInput.safeParse(req.body);
    if (!id.success || !input.success) return res.status(400).json({ message: "Choose a ring and enter a valid email username. Leave the password blank to keep it." });
    res.json({ account: await updateTestAccount(id.data, input.data, account.username) });
  } catch (error) {
    next(error);
  } finally {
    if (req.body && typeof req.body === "object") delete req.body.password;
  }
});

app.delete("/api/test-accounts/:id", async (req, res, next) => {
  try {
    if (!await requireAccount(req, res)) return;
    const id = accountId.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: "Invalid test account ID." });
    await deleteTestAccount(id.data);
    res.json({ message: "Test account removed." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/test-accounts/:id/reveal", async (req, res, next) => {
  try {
    if (!await requireAccount(req, res)) return;
    const id = accountId.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: "Invalid test account ID." });
    res.json({ password: await revealTestAccountPassword(id.data) });
  } catch (error) {
    next(error);
  }
});
app.get("/api/activity", (_req, res) => res.json(activity));

app.post("/api/test-cases/generate", async (req, res, next) => {
  try {
    const input = testCaseInput.parse(req.body);
    res.json(await generateTestCases(input));
  } catch (error) {
    next(error);
  }
});

app.post("/api/requirements/extract", async (req, res) => {
  const input = documentInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ message: "Upload a TXT, Markdown, PDF or DOCX document up to 5 MB." });
  try {
    res.json(await extractRequirements(input.data));
  } catch (error) {
    console.warn("Requirement extraction failed:", error instanceof Error ? error.message : "Invalid document");
    res.status(422).json({ message: "Could not read the document. Use a valid text-based TXT, Markdown, PDF or DOCX file with 8 to 60,000 characters of text. Scanned PDFs require OCR." });
  }
});

app.post("/api/policy/setup", async (req, res) => {
  const input = z.object({
    question: z.string().min(4).max(4000),
    context: z.array(z.string().max(4000)).max(3).default([])
  }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ message: "Describe the policy in 4 to 4,000 characters. Do not include credentials." });
  try {
    res.json(await planPolicySetup(input.data.question, input.data.context));
  } catch {
    res.status(503).json({ message: "OpenAI portal recommendation is unavailable. Check the backend AI configuration and retry. No portal or policy has been changed." });
  }
});

app.post("/api/policy/login/:action", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!isAuthorizedLocalRequest(req)) {
    return res.status(403).json({ message: "Browser login requires localhost, POLICY_AUTOMATION_ENABLED=true, and a valid automation token of at least 32 characters. It is unavailable on Vercel." });
  }
  try {
    if (req.params.action === "start") {
      const input = z.object({
        portalId, username: z.email().max(254), password: z.string().min(1).max(1024)
      }).safeParse(req.body);
      if (!input.success) return res.status(400).json({ message: "Select an approved portal and provide a valid admin email and password." });
      delete req.body.password;
      return res.json(await startPolicyLogin(input.data));
    }
    if (req.params.action === "close") {
      const input = z.object({ sessionId: z.uuid() }).safeParse(req.body);
      if (!input.success) return res.status(400).json({ message: "Invalid browser session ID." });
      await closePolicyLogin(input.data.sessionId);
      return res.json({ message: "Policy browser session closed." });
    }
    return res.status(404).json({ message: "Unknown login action." });
  } catch (error) {
    // Do not log request bodies or raw browser errors in credential-handling endpoints.
    res.status(502).json({ message: error instanceof Error ? error.message : "Policy browser operation failed." });
  } finally {
    if (req.body && typeof req.body === "object") delete req.body.password;
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

app.get("/api/directory/search", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(await searchDirectory(String(req.query.q ?? "")));
  } catch (error) {
    next(error);
  }
});

app.post("/api/directory/changes", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const input = changeRequest.parse(req.body);
    res.json(await saveDirectoryChanges(input.revision, input.changes));
  } catch (error) {
    next(error);
  }
});

app.post("/api/directory/plan", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const input = z.object({
      prompt: z.string().trim().min(4).max(4000), revision: z.number().int().nonnegative()
    }).strict().parse(req.body);
    res.json(await planDirectoryChanges(input.prompt, input.revision));
  } catch (error) {
    next(error);
  }
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

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof DirectoryError) {
    console.warn("Inventory operation rejected:", error.message);
    return res.status(error.status).json({ message: error.message });
  }
  if (error instanceof AuthError) {
    return res.status(error.status).json({ message: error.message });
  }
  if (req.path.startsWith("/api/test-accounts")) {
    // pg errors can echo query parameters, so never log them for credential storage routes.
    console.warn("Test account operation failed; request details omitted.");
    return res.status(503).json({ message: "The test account database is unavailable. Nothing was changed." });
  }
  if (req.path.startsWith("/api/policy/login/") || req.path === "/api/auth/login") {
    console.warn("Policy login request rejected; request details omitted.");
    return res.status(400).json({ message: "Invalid login request. Credentials and request details were not logged." });
  }
  console.error(error);
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Request failed validation.", details: error.issues });
  }
  return res.status(500).json({ message: "The operation could not be completed safely." });
});

export default app;
