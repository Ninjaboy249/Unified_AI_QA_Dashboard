import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { Browser } from "playwright";
import { portals } from "./policySetupService.js";

const sessions = new Map<string, { browser: Browser; timer: NodeJS.Timeout }>();
let starting = false;

export function isAuthorizedLocalRequest(req: Request) {
  const token = process.env.POLICY_AUTOMATION_TOKEN;
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
  const host = req.hostname;
  const origin = req.get("origin");
  if (process.env.POLICY_AUTOMATION_ENABLED !== "true" || process.env.VERCEL || !local ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) ||
      (origin && origin !== (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")) || !token || token.length < 32) return false;
  const supplied = Buffer.from(req.get("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function startPolicyLogin(input: { portalId: keyof typeof portals; username: string; password: string }) {
  if (starting || sessions.size > 0) throw new Error("Close the current policy browser before starting another session.");
  starting = true;
  let browser: Browser | undefined;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ acceptDownloads: false });
    // Restrict credential-bearing browser traffic to approved Microsoft identity and portal hosts.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const approved = ["microsoft.com", "microsoftonline.com", "msauth.net", "msftauth.net",
        "msauthimages.net", "msftauthimages.net", "office.com", "office.net", "microsoftonline-p.com"];
      const allowed = url.protocol === "https:" && approved.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
      if (allowed) await route.continue();
      else await route.abort();
    });
    const page = await context.newPage();
    await page.goto(portals[input.portalId].url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const email = page.locator('input[name="loginfmt"]');
    await email.waitFor({ timeout: 30_000 });
    if (new URL(page.url()).hostname !== "login.microsoftonline.com") throw new Error("Unsupported identity provider.");
    await email.fill(input.username);
    await page.locator('input[type="submit"]').click();
    const password = page.locator('input[name="passwd"]');
    await password.waitFor({ timeout: 30_000 });
    if (new URL(page.url()).hostname !== "login.microsoftonline.com") throw new Error("Unsupported identity provider.");
    await password.fill(input.password);
    await page.locator('input[type="submit"]').click();
    const sessionId = randomUUID();
    const activeBrowser = browser;
    const timer = setTimeout(() => {
      void closePolicyLogin(sessionId).catch(() => console.warn("Policy browser cleanup failed; close the browser manually."));
    }, 10 * 60_000);
    timer.unref();
    sessions.set(sessionId, { browser: activeBrowser, timer });
    activeBrowser.on("disconnected", () => {
      clearTimeout(timer);
      sessions.delete(sessionId);
    });
    return {
      sessionId,
      message: "Credentials submitted, not verified. Complete MFA and any sign-in errors in the browser on the server desktop. Review the recommended policy path there. No policy changes have been made. Session closes in 10 minutes."
    };
  } catch {
    if (browser) await browser.close();
    throw new Error("Microsoft sign-in could not be automated. Verify Chromium is installed and the local desktop is available. Federated/custom sign-in flows are not supported; use the portal link to sign in manually.");
  } finally {
    starting = false;
    input.password = "";
  }
}

export async function closePolicyLogin(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;
  await session.browser.close();
  clearTimeout(session.timer);
  sessions.delete(sessionId);
}
