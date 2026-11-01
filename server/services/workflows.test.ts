import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { test } from "node:test";
import { app } from "../app.js";
import { extractRequirements } from "./requirementService.js";
import { generateTestCases } from "./testCaseService.js";
import { planPolicySetup } from "./policySetupService.js";
import { findScreenshots, isMicrosoftDocumentationUrl } from "./screenshotService.js";
import { closePolicyLogin, startPolicyLogin } from "./policyLoginService.js";

const aiCase = {
  id: "TC-001", title: "Teams sign-in accepts a valid test user", type: "Positive",
  priority: "High", preconditions: "Test tenant available",
  steps: ["Open Teams mobile", "Sign in with an authorized test account"],
  expectedResult: "Teams opens the user's chat list"
};
const input = {
  requirement: "Microsoft Teams supports authorized mobile sign-in.", feature: "Sign in",
  platform: "Android" as const, priority: "High" as const, count: 1
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ai = (body: unknown) => json({ choices: [{ message: { content: JSON.stringify(body) } }] });

test("Teams mobile workflows and local login protections", async (t) => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_BASE_URL = "https://ai.example.invalid/v1";
  process.env.POLICY_AUTOMATION_ENABLED = "true";
  process.env.POLICY_AUTOMATION_TOKEN = "test-only-operator-token-at-least-32-characters";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  delete process.env.VERCEL;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => originalFetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body)
  });
  const authorization = { Authorization: `Bearer ${process.env.POLICY_AUTOMATION_TOKEN}` };
  try {
    await t.test("Web is rejected at the API boundary", async () => {
      globalThis.fetch = async () => { throw new Error("AI should not be called"); };
      const response = await post("/api/test-cases/generate", { ...input, platform: "Web" });
      assert.equal(response.status, 400);
    });

    await t.test("Android and iOS generation stay Teams-scoped and preserve count", async () => {
      for (const platform of ["Android", "iOS"] as const) {
        globalThis.fetch = async (_url, init) => {
          assert.match(String(init?.body), /Only cover Microsoft Teams/);
          assert.match(String(init?.body), new RegExp(platform));
          return ai({ testCases: [aiCase] });
        };
        const result = await generateTestCases({ ...input, platform });
        assert.equal(result.mode, "openai");
        assert.equal(result.testCases.length, 1);
        assert.match(result.testCases[0].title, new RegExp(`Microsoft Teams \\(${platform}\\)`));
        assert.deepEqual(result.testCases[0].attachments, []);
      }
    });

    await t.test("Invalid AI output is explicitly marked as demo templates", async () => {
      globalThis.fetch = async () => ai({ testCases: [] });
      const result = await generateTestCases(input);
      assert.equal(result.mode, "demo");
      assert.match(result.notice, /not requirement-complete/);
      assert.match(result.testCases[0].steps[0], /Microsoft Teams on Android/);
    });

    await t.test("Document structuring preserves the complete original text", async () => {
      globalThis.fetch = async () => ai({ requirements: [{ id: "REQ-1", title: "Sign in", description: input.requirement }] });
      const result = await extractRequirements({ fileName: "requirements.md", content: Buffer.from(input.requirement).toString("base64") });
      assert.equal(result.mode, "ai");
      assert.equal(result.text, input.requirement);
      assert.equal(result.requirements[0].id, "REQ-1");
    });

    await t.test("Unavailable structuring uses labeled paragraph extraction", async () => {
      globalThis.fetch = async () => json({}, 503);
      const result = await extractRequirements({ fileName: "requirements.txt", content: Buffer.from("Teams sign in.\n\nTeams joins a meeting.").toString("base64") });
      assert.equal(result.mode, "extracted");
      assert.equal(result.requirements.length, 2);
      assert.match(result.notice, /AI structuring unavailable/);
    });

    await t.test("PDF and DOCX text are parsed without dropping source text", async () => {
      globalThis.fetch = async () => json({}, 503);
      const pdf = makePdf("Microsoft Teams mobile sign in requirement.");
      const pdfResult = await extractRequirements({ fileName: "requirements.pdf", content: pdf.toString("base64") });
      assert.match(pdfResult.text, /Microsoft Teams mobile sign in requirement/);
      const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Microsoft Teams mobile sign in requirement.</w:t></w:r></w:p></w:body></w:document>';
      const word = makeZip({
        "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "word/document.xml": xml
      });
      const wordResult = await extractRequirements({ fileName: "requirements.docx", content: word.toString("base64") });
      assert.match(wordResult.text, /Microsoft Teams mobile sign in requirement/);
    });

    await t.test("Invalid, empty and oversized documents fail explicitly", async () => {
      const request = (fileName: string, text: string) => extractRequirements({ fileName, content: Buffer.from(text).toString("base64") });
      await assert.rejects(request("bad.pdf", "not a pdf"), /Invalid PDF/);
      await assert.rejects(request("empty.txt", " "), /No readable requirements/);
      await assert.rejects(request("large.txt", "x".repeat(60_001)), /60,000/);
      const unsupported = await post("/api/requirements/extract", { fileName: "old.doc", content: "YWJjZA==" });
      assert.equal(unsupported.status, 400);
    });

    await t.test("Screenshot lookup only returns attributed platform-matched Microsoft images", async () => {
      globalThis.fetch = async (url) => {
        if (String(url).includes("chat/completions")) return ai({ testCases: [aiCase] });
        if (String(url).includes("/api/search")) return json({ results: [
          { title: "Teams mobile", url: "https://evil.example/teams" },
          { title: "Teams mobile", url: "https://learn.microsoft.com/en-us/microsoftteams/mobile" }
        ] });
        assert.match(String(url), /^https:\/\/learn\.microsoft\.com\//);
        return new Response('<main><img src="./media/android-chat.png" alt="Teams Android chat screenshot"><img src="https://evil.example/android.png" alt="Android"><img src="./media/ios-chat.png" alt="Teams iOS"></main>');
      };
      const result = await findScreenshots("Chat", "Android");
      assert.equal(result.screenshots.length, 1);
      assert.equal(result.screenshots[0].url, "https://learn.microsoft.com/en-us/microsoftteams/media/android-chat.png");
      assert.equal(result.screenshots[0].sourceUrl, "https://learn.microsoft.com/en-us/microsoftteams/mobile");
      assert.equal(isMicrosoftDocumentationUrl("https://learn.microsoft.com.evil.example/a.png"), false);
      assert.equal(isMicrosoftDocumentationUrl("http://learn.microsoft.com/a.png"), false);
      const generated = await generateTestCases({ ...input, includeScreenshots: true });
      assert.deepEqual(generated.testCases[0].attachments, result.screenshots);
    });

    await t.test("Screenshot failures are visible without blocking case generation", async () => {
      globalThis.fetch = async (url) => String(url).includes("chat/completions")
        ? ai({ testCases: [aiCase] }) : json({}, 503);
      const result = await generateTestCases({ ...input, includeScreenshots: true });
      assert.equal(result.testCases.length, 1);
      assert.deepEqual(result.testCases[0].attachments, []);
      assert.match(result.notice, /Screenshot lookup unavailable/);
    });

    await t.test("OpenAI chooses a fixed portal and receives follow-up context", async () => {
      globalThis.fetch = async (_url, init) => {
        assert.match(String(init?.body), /Previous Teams policy request/);
        return ai({ portalId: "teams", explanation: "Use a Teams Administrator role.", steps: ["Open Messaging policies", "Review changes manually"] });
      };
      const result = await planPolicySetup("Disable chat for test users", ["Previous Teams policy request"]);
      assert.equal(result.portal.url, "https://admin.teams.microsoft.com/");
      globalThis.fetch = async () => ai({ portalId: "https://evil.example", explanation: "Use a portal", steps: ["Enter credentials"] });
      await assert.rejects(planPolicySetup("Configure a policy"), /valid portal recommendation/);
    });

    await t.test("Missing AI configuration never returns a guessed setup portal", async () => {
      delete process.env.OPENAI_API_KEY;
      const result = await post("/api/policy/setup", { question: "Configure Teams policy" });
      assert.equal(result.status, 503);
      process.env.OPENAI_API_KEY = "test-only-key";
    });

    await t.test("Login requires token, loopback Host, trusted Origin and opt-in", async () => {
      assert.equal((await post("/api/policy/login/unknown", {})).status, 403);
      assert.equal((await post("/api/policy/login/unknown", {}, authorization)).status, 404);
      assert.equal((await post("/api/policy/login/unknown", {}, { ...authorization, Origin: "https://evil.example" })).status, 403);
      const spoofedHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = request(`${base}/api/policy/login/unknown`, {
          method: "POST", headers: { ...authorization, Host: "evil.example" }
        }, (response) => {
          response.resume();
          resolve(response.statusCode);
        });
        req.on("error", reject);
        req.end();
      });
      assert.equal(spoofedHostStatus, 403);
      process.env.POLICY_AUTOMATION_ENABLED = "false";
      assert.equal((await post("/api/policy/login/unknown", {}, authorization)).status, 403);
      process.env.POLICY_AUTOMATION_ENABLED = "true";
      process.env.VERCEL = "1";
      assert.equal((await post("/api/policy/login/unknown", {}, authorization)).status, 403);
      delete process.env.VERCEL;
    });

    await t.test("Login rejects unapproved portals before browser launch and never calls AI", async () => {
      globalThis.fetch = async () => { throw new Error("Login must not call AI"); };
      const result = await post("/api/policy/login/start", {
        portalId: "https://evil.example", username: "admin@example.invalid", password: "fake-test-password"
      }, authorization);
      assert.equal(result.status, 400);
      const closed = await post("/api/policy/login/close", { sessionId: "cb794d16-e403-4395-8076-134efc261852" }, authorization);
      assert.equal(closed.status, 200);
      await closePolicyLogin("already-closed");
    });

    await t.test("Malformed credential requests never log request contents", async (logTest) => {
      const logged: string[] = [];
      logTest.mock.method(console, "error", (...values: unknown[]) => logged.push(values.join(" ")));
      logTest.mock.method(console, "warn", (...values: unknown[]) => logged.push(values.join(" ")));
      const result = await originalFetch(`${base}/api/policy/login/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authorization },
        body: '{"password":"fake-credential-sentinel",invalid}'
      });
      assert.equal(result.status, 400);
      assert(logged.length > 0);
      assert(!logged.join(" ").includes("fake-credential-sentinel"));
      assert(!JSON.stringify(await result.json()).includes("fake-credential-sentinel"));
    });

    await t.test("Browser submits only the isolated fake Microsoft login and closes its session", async (browserTest) => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const originalNewPage = context.newPage.bind(context);
      let submittedUser = "";
      let submittedPassword = "";
      const visited: string[] = [];
      browserTest.mock.method(context, "newPage", async () => {
        const page = await originalNewPage();
        await page.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          visited.push(`${url.hostname}${url.pathname}`);
          if (url.hostname === "admin.teams.microsoft.com") {
            return route.fulfill({ contentType: "text/html", body: '<script>location.href="https://login.microsoftonline.com/test"</script>' });
          }
          assert.equal(url.hostname, "login.microsoftonline.com");
          if (url.pathname === "/test") {
            return route.fulfill({ contentType: "text/html", body: '<form action="/password"><input name="loginfmt"><input type="submit"></form>' });
          }
          if (url.pathname === "/password") {
            submittedUser = url.searchParams.get("loginfmt") ?? "";
            return route.fulfill({ contentType: "text/html", body: '<form action="/mfa" method="POST"><input name="passwd" type="password"><input type="submit"></form>' });
          }
          submittedPassword = new URLSearchParams(route.request().postData() ?? "").get("passwd") ?? "";
          return route.fulfill({ contentType: "text/html", body: "<h1>Complete MFA manually</h1>" });
        });
        return page;
      });
      browserTest.mock.method(browser, "newContext", async () => context);
      browserTest.mock.method(chromium, "launch", async () => browser);
      globalThis.fetch = async () => { throw new Error("Credentials must not reach AI"); };
      try {
        const credentials = { portalId: "teams" as const, username: "admin@example.invalid", password: "fake-test-password" };
        const session = await startPolicyLogin(credentials);
        assert.equal(submittedUser, credentials.username);
        assert.equal(submittedPassword, "fake-test-password");
        assert.equal(credentials.password, "");
        assert.match(session.message, /not verified/);
        assert.match(session.message, /No policy changes/);
        await closePolicyLogin(session.sessionId);
        assert.equal(browser.isConnected(), false);
      } catch (error) {
        assert.fail(`${error instanceof Error ? error.message : "Browser test failed"}; visited: ${visited.join(", ")}`);
      } finally {
        await browser.close();
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

function makePdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${pdf}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

function makeZip(files: Record<string, string>) {
  const entries: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const file = Buffer.from(content);
    const filename = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of file) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 14);
    header.writeUInt32LE(file.length, 18);
    header.writeUInt32LE(file.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    header.copy(record, 6, 4, 30);
    record.writeUInt32LE(offset, 42);
    entries.push(header, filename, file);
    central.push(record, filename);
    offset += header.length + filename.length + file.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, directory, end]);
}
