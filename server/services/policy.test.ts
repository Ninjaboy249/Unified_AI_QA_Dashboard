import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { app } from "../app.js";
import type { PolicyAnswer } from "../types.js";
import { generateEmbeddings } from "./openaiService.js";
import { allowedLearnUrl, extractLearnArticle, retrieveLearnDocuments } from "./policyLearnService.js";
import { readPolicyBytes } from "./policyHttp.js";
import { policyQuestionInput } from "./policySchema.js";
import { answerPolicyQuestion, chunkPolicyDocuments, cosineSimilarity } from "./policyService.js";
import { makeZip } from "./testFixtures.js";

const learnUrl = "https://learn.microsoft.com/en-us/microsoftteams/manage-external-access";
const wordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const googleDocMime = "application/vnd.google-apps.document";
const folderId = "public-policy-folder";
const apiKey = "test-public-drive-api-key";
const article = "<html><nav>Ignored navigation secret</nav><main><div class='content'><h1>Teams external access</h1><p>Administrators can configure external access for Teams using allowed or blocked domains.</p><script>Ignored script secret</script></div></main></html>";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const ai = (value: unknown) => json({ choices: [{ message: { content: JSON.stringify(value) } }] });
const claim = { found: true, claims: [{ text: "Teams external access supports domain controls.", citations: ["C1"] }] };

function embeddingResponse(init?: RequestInit, vector = [1, 0]) {
  const input = JSON.parse(String(init?.body)) as { input: string[] };
  return json({ data: input.input.map((_text, index) => ({ index, embedding: vector })) });
}

function restoreEnvironment(environment: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
}

function wordDocument(text: string) {
  return makeZip({
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  });
}

test("Policy article retrieval and grounded generation", async (t) => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  process.env.OPENAI_API_KEY = "policy-test-ai-key";
  process.env.OPENAI_BASE_URL = "https://ai.example.invalid/v1";
  const mockLearn = (generated: unknown = claim) => {
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/embeddings")) return embeddingResponse(init);
      if (String(url).includes("/chat/completions")) return ai(generated);
      if (String(url).includes("/api/search")) return json({ results: [{ title: "Teams external access", url: learnUrl, description: "Search description is not article evidence." }] });
      assert.equal(String(url), learnUrl);
      return new Response(article);
    };
  };
  try {
    await t.test("Extracts full article text, not navigation or search snippets", async () => {
      const text = extractLearnArticle(article);
      assert.match(text, /allowed or blocked domains/);
      assert(!text.includes("Ignored"));
      mockLearn();
      const result = await retrieveLearnDocuments("Teams external access");
      assert.equal(result.documents.length, 1);
      assert.equal(result.documents[0].text, text);
      assert(!result.documents[0].text.includes("Search description"));
    });

    await t.test("Only approved Learn HTTPS hosts and ports are accepted", () => {
      assert(allowedLearnUrl(learnUrl));
      for (const url of ["https://learn.microsoft.com.evil.test/a", "http://learn.microsoft.com/a", "https://learn.microsoft.com:444/a", "https://user@learn.microsoft.com/a"]) {
        assert.equal(allowedLearnUrl(url), false);
      }
    });

    await t.test("Rejects redirects outside Microsoft Learn without fetching them", async () => {
      let calls = 0;
      globalThis.fetch = async (url) => {
        calls++;
        if (String(url).includes("/api/search")) return json({ results: [{ title: "Teams", url: learnUrl }] });
        assert.equal(String(url), learnUrl);
        return new Response(null, { status: 302, headers: { Location: "https://evil.test/private" } });
      };
      const result = await retrieveLearnDocuments("Teams policy");
      assert.equal(result.documents.length, 0);
      assert.match(result.notices[0], /unapproved/);
      assert.equal(calls, 2);
    });

    await t.test("Allows same-host redirects and cites the final article URL", async () => {
      globalThis.fetch = async (url) => {
        if (String(url).includes("/api/search")) return json({ results: [{ title: "Teams", url: learnUrl }] });
        if (String(url) === learnUrl) return new Response(null, { status: 302, headers: { Location: "/en-us/microsoftteams/updated-policy" } });
        return new Response(article);
      };
      const result = await retrieveLearnDocuments("Teams policy");
      assert.equal(result.documents[0].sourceUrl, "https://learn.microsoft.com/en-us/microsoftteams/updated-policy");
    });

    await t.test("Chunking preserves the tail, 1600 limit and 200-character overlap", () => {
      const text = "a".repeat(1590) + "BOUNDARY" + "b".repeat(2010) + "TAIL";
      const chunks = chunkPolicyDocuments([{ title: "Policy", fileName: "policy.docx", kind: "drive", text }]);
      assert(chunks.every((item) => item.text.length <= 1600));
      assert.equal(chunks[0].text.slice(-200), chunks[1].text.slice(0, 200));
      assert(chunks.at(-1)?.text.endsWith("TAIL"));
      assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
      assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
      assert.throws(() => cosineSimilarity([1], [1, 0]), /dimensions/);
    });

    await t.test("Drive consent is required and caller file IDs or URLs are rejected", () => {
      assert(policyQuestionInput.safeParse({ question: "Teams policy" }).success);
      assert(policyQuestionInput.safeParse({ question: "Teams policy", source: "drive", allowDocumentAI: true }).success);
      for (const input of [
        { source: "drive", allowDocumentAI: false },
        { source: "both", allowDocumentAI: false },
        { source: "drive", documentIds: ["doc1"], allowDocumentAI: true },
        { source: "drive", folderId: "another-folder", allowDocumentAI: true },
        { source: "drive", url: "https://evil.test/private", allowDocumentAI: true }
      ]) assert.equal(policyQuestionInput.safeParse({ question: "Teams policy", ...input }).success, false);
    });

    await t.test("RAG returns original excerpts and validated source citations", async () => {
      mockLearn();
      const result = await answerPolicyQuestion("Teams external access");
      assert.equal(result.mode, "rag");
      assert.equal(result.found, true);
      assert.equal(result.citations[0].sourceUrl, learnUrl);
      assert.match(result.citations[0].excerpt, /allowed or blocked domains/);
      assert.match(result.answer, /\[C1\]/);
    });

    await t.test("Unknown citations, empty and malformed AI answers are explicit errors", async () => {
      for (const generated of [
        { found: true, claims: [{ text: "Invented", citations: ["C99"] }] },
        { found: true, claims: [] },
        { found: true, claims: [{ text: "Uncited", citations: [] }] },
        { found: false, claims: [{ text: "Inconsistent", citations: ["C1"] }] }
      ]) {
        mockLearn(generated);
        await assert.rejects(answerPolicyQuestion("Teams external access"));
      }
    });

    await t.test("Insufficient evidence returns no answer and no citations", async () => {
      mockLearn({ found: false, claims: [] });
      const result = await answerPolicyQuestion("Unsupported policy detail");
      assert.equal(result.found, false);
      assert.deepEqual(result.citations, []);
    });

    await t.test("Below-threshold similarity does not call the chat model", async () => {
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/api/search")) return json({ results: [{ title: "Teams", url: learnUrl }] });
        if (String(url).endsWith("/embeddings")) {
          const body = JSON.parse(String(init?.body)) as { input: string[] };
          return json({ data: body.input.map((_text, index) => ({ index, embedding: index ? [0, 1] : [1, 0] })) });
        }
        assert(!String(url).includes("/chat/completions"));
        return new Response(article);
      };
      assert.equal((await answerPolicyQuestion("Unsupported policy")).found, false);
    });

    await t.test("The exact 0.25 retrieval threshold is inclusive", async () => {
      for (const similarity of [0.249, 0.25]) {
        let chatCalled = false;
        globalThis.fetch = async (url, init) => {
          if (String(url).includes("/api/search")) return json({ results: [{ title: "Teams", url: learnUrl }] });
          if (String(url).endsWith("/embeddings")) {
            const body = JSON.parse(String(init?.body)) as { input: string[] };
            return json({ data: body.input.map((_text, index) => ({
              index, embedding: index ? [similarity, Math.sqrt(1 - similarity ** 2)] : [1, 0]
            })) });
          }
          if (String(url).endsWith("/chat/completions")) { chatCalled = true; return ai(claim); }
          return new Response(article);
        };
        assert.equal((await answerPolicyQuestion("Teams policy")).found, similarity >= 0.25);
        assert.equal(chatCalled, similarity >= 0.25);
      }
    });

    await t.test("Generation receives at most eight retrieved excerpts", async () => {
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/api/search")) return json({ results: [{ title: "Teams", url: learnUrl }] });
        if (String(url).endsWith("/embeddings")) return embeddingResponse(init);
        if (String(url).endsWith("/chat/completions")) {
          const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
          const evidence = JSON.parse(body.messages[1].content.split("\n").at(-1)!) as { excerpts: unknown[] };
          assert.equal(evidence.excerpts.length, 8);
          return ai(claim);
        }
        return new Response("<main>" + "Teams external access policy. ".repeat(700) + "</main>");
      };
      assert.equal((await answerPolicyQuestion("Teams policy")).found, true);
    });

    await t.test("Learn failure explicitly labels local fallback evidence", async () => {
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("/api/search")) return json({}, 503);
        if (String(url).endsWith("/embeddings")) return embeddingResponse(init);
        return ai(claim);
      };
      const result = await answerPolicyQuestion("Teams external access");
      assert.equal(result.citations[0].kind, "local");
      assert(result.notices.some((notice) => /Local Markdown/.test(notice)));
    });

    await t.test("Missing AI keys and invalid vectors never become demo policy answers", async () => {
      delete process.env.OPENAI_API_KEY;
      await assert.rejects(generateEmbeddings(["Teams"]), /OPENAI_API_KEY/);
      process.env.OPENAI_API_KEY = "policy-test-ai-key";
      for (const data of [
        [], [{ index: 1, embedding: [1, 0] }], [{ index: 0, embedding: [0, 0] }],
        [{ index: 0, embedding: [1, 0] }, { index: 0, embedding: [1] }]
      ]) {
        globalThis.fetch = async () => json({ data });
        await assert.rejects(generateEmbeddings(["Teams"]));
      }
    });

    await t.test("Embedding payloads above 1 MB remain supported", async () => {
      globalThis.fetch = async (_url, init) => embeddingResponse(init, Array.from({ length: 1536 }, () => 0.123456789));
      assert.equal((await generateEmbeddings(Array.from({ length: 80 }, () => "Policy excerpt"))).length, 80);
    });

    await t.test("Source streams and articles enforce size limits", async () => {
      await assert.rejects(readPolicyBytes(new Response("a".repeat(11)), 10), /size limit/);
      await assert.rejects(readPolicyBytes(new Response("x", { headers: { "content-length": "11" } }), 10), /size limit/);
      assert.throws(() => extractLearnArticle("<main>" + "x".repeat(60_001) + "</main>"), /60,000/);
      assert.throws(() => extractLearnArticle("<nav>Not an article</nav>"), /readable article/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("Automatic public Drive folder retrieval without login or per-file links", async (t) => {
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  Object.assign(process.env, {
    GOOGLE_DRIVE_API_KEY: apiKey, GOOGLE_DRIVE_FOLDER_ID: folderId,
    OPENAI_API_KEY: "policy-test-ai-key", OPENAI_BASE_URL: "https://ai.example.invalid/v1"
  });
  for (const key of ["DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_DRIVE_SECRET", "GOOGLE_DRIVE_FOLDER_RESOURCE_KEY"]) delete process.env[key];
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const get = (url: string) => originalFetch(`${base}${url}`);
  const ask = (extra: Record<string, unknown> = {}) => originalFetch(`${base}/api/policy/ask`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Teams external access", source: "drive", allowDocumentAI: true, ...extra })
  });
  let listCalls = 0;
  const defaultFile = { id: "doc1", name: "Teams policy.docx", mimeType: wordMime, parents: [folderId] };
  let files = [defaultFile];
  const word = wordDocument("Company policy: disable Teams external access unless explicitly approved by a QA administrator.");
  const mockGoogle = () => {
    listCalls = 0;
    files = [defaultFile];
    globalThis.fetch = async (url, init) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === "www.googleapis.com") {
        assert.equal(parsed.searchParams.get("key"), apiKey);
        assert.equal(new Headers(init?.headers).get("authorization"), null);
        assert.equal(new Headers(init?.headers).get("cookie"), null);
        assert.equal(init?.redirect, "error");
        if (parsed.pathname.endsWith(`/files/${folderId}`)) return json({ id: folderId, name: "Public QA policies", mimeType: "application/vnd.google-apps.folder" });
        if (parsed.pathname.endsWith("/files")) {
          listCalls++;
          assert.match(parsed.searchParams.get("q") ?? "", new RegExp(`'${folderId}' in parents`));
          assert.equal(parsed.searchParams.get("supportsAllDrives"), "true");
          assert.equal(parsed.searchParams.get("includeItemsFromAllDrives"), "true");
          return json({ files });
        }
        if (parsed.searchParams.get("alt") === "media" || parsed.pathname.endsWith("/export")) return new Response(word);
        const id = parsed.pathname.split("/").at(-1);
        return json(files.find((file) => file.id === id));
      }
      assert(!String(init?.body).includes(apiKey));
      if (parsed.pathname.endsWith("/embeddings")) return embeddingResponse(init);
      if (parsed.pathname.endsWith("/chat/completions")) return ai(claim);
      if (parsed.pathname === "/api/search") return json({ results: [{ title: "Teams external access", url: learnUrl }] });
      assert.equal(parsed.href, learnUrl);
      return new Response(article);
    };
  };
  try {
    mockGoogle();
    await t.test("Configuration status is actionable and never exposes the API key", async () => {
      delete process.env.GOOGLE_DRIVE_API_KEY;
      const missing = await (await get("/api/policy/drive/status")).json() as { configured: boolean; message: string };
      assert.equal(missing.configured, false);
      assert.match(missing.message, /GOOGLE_DRIVE_API_KEY/);
      assert.equal((await get("/api/policy/drive/documents")).status, 503);
      process.env.GOOGLE_DRIVE_API_KEY = apiKey;
      const status = await get("/api/policy/drive/status");
      const configured = await status.json() as { configured: boolean; mode: string; folderUrl: string };
      assert.equal(configured.configured, true);
      assert.equal(configured.mode, "public-folder");
      assert.equal(configured.folderUrl, `https://drive.google.com/drive/folders/${folderId}`);
      assert(!JSON.stringify(configured).includes(apiKey));
      assert.equal(status.headers.get("cache-control"), "no-store");
      assert.equal(status.headers.get("set-cookie"), null);
    });

    await t.test("Discovers the configured folder anonymously with no download-link input", async () => {
      const response = await get("/api/policy/drive/documents");
      assert.equal(response.status, 200);
      const result = await response.json() as { folderTitle: string; documents: Array<{ id: string; sourceUrl: string }> };
      assert.equal(result.folderTitle, "Public QA policies");
      assert.equal(result.documents[0].id, "doc1");
      assert.equal(result.documents[0].sourceUrl, "https://drive.google.com/file/d/doc1/view");
      assert(!JSON.stringify(result).includes(apiKey));
    });

    await t.test("Extracts Word content for RAG and rediscoveries are not cached", async () => {
      const before = listCalls;
      for (let index = 0; index < 2; index++) {
        const response = await ask();
        assert.equal(response.status, 200);
        const answer = await response.json() as PolicyAnswer;
        assert.equal(answer.citations[0].kind, "drive");
        assert.match(answer.citations[0].excerpt, /explicitly approved by a QA administrator/);
        assert(!JSON.stringify(answer).includes(apiKey));
      }
      assert.equal(listCalls, before + 2);
    });

    await t.test("Automatically processes all three supported files", async () => {
      files = [defaultFile, { ...defaultFile, id: "doc2", name: "Meetings policy.docx" }, { ...defaultFile, id: "doc3", name: "Messaging policy.docx" }];
      const googleFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        if (String(url).endsWith("/embeddings")) {
          for (const file of files) assert(String(init?.body).includes(file.name));
        }
        return googleFetch(url, init);
      };
      assert.equal((await ask()).status, 200);
      mockGoogle();
    });

    await t.test("Both sources produce citations mapped to Learn and Drive excerpts", async () => {
      const googleFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => String(url).endsWith("/chat/completions")
        ? ai({ found: true, claims: [{ text: "Review company approval alongside Microsoft guidance.", citations: ["C1", "C2"] }] })
        : googleFetch(url, init);
      const response = await ask({ source: "both" });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json() as PolicyAnswer).citations.map((item) => item.kind), ["learn", "drive"]);
      mockGoogle();
    });

    await t.test("Public Google Docs are exported as DOCX before extraction", async () => {
      files = [{ ...defaultFile, mimeType: googleDocMime }];
      const googleFetch = globalThis.fetch;
      let exported = false;
      globalThis.fetch = async (url, init) => {
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith("/export")) { exported = true; assert.equal(parsed.searchParams.get("mimeType"), wordMime); }
        return googleFetch(url, init);
      };
      assert.equal((await ask()).status, 200);
      assert(exported);
      mockGoogle();
    });

    await t.test("Follows pagination, deduplicates files and never omits an extra document", async () => {
      const googleFetch = globalThis.fetch;
      let pages = 0;
      globalThis.fetch = async (url, init) => {
        if (new URL(String(url)).pathname.endsWith("/files")) {
          pages++;
          return pages === 1 ? json({ files: [defaultFile], nextPageToken: "next-page" })
            : json({ files: [defaultFile, { ...defaultFile, id: "doc2" }] });
        }
        return googleFetch(url, init);
      };
      const response = await get("/api/policy/drive/documents");
      assert.equal((await response.json() as { documents: unknown[] }).documents.length, 2);
      assert.equal(pages, 2);
      mockGoogle();
      files = Array.from({ length: 4 }, (_unused, index) => ({ ...defaultFile, id: `doc${index}` }));
      const tooMany = await ask();
      assert.equal(tooMany.status, 422);
      assert.match((await tooMany.json() as { message: string }).message, /more than three/);
      mockGoogle();
    });

    await t.test("Incomplete or repeated pagination is an explicit failure", async () => {
      const googleFetch = globalThis.fetch;
      for (const body of [
        { files: [defaultFile], incompleteSearch: true },
        { files: [], nextPageToken: "repeated" }
      ]) {
        globalThis.fetch = async (url, init) => new URL(String(url)).pathname.endsWith("/files") ? json(body) : googleFetch(url, init);
        assert.equal((await get("/api/policy/drive/documents")).status, 502);
      }
      mockGoogle();
    });

    await t.test("Empty folders produce a labeled no-answer response without AI calls", async () => {
      files = [];
      const googleFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        assert(!String(url).includes("/embeddings"));
        assert(!String(url).includes("/chat/completions"));
        return googleFetch(url, init);
      };
      const response = await ask();
      assert.equal(response.status, 200);
      const answer = await response.json() as PolicyAnswer;
      assert.equal(answer.found, false);
      assert.deepEqual(answer.citations, []);
      assert(answer.notices.some((notice) => /No supported Word/.test(notice)));
      mockGoogle();
    });

    await t.test("Private, inaccessible and moved files cannot become stale policy answers", async () => {
      const googleFetch = globalThis.fetch;
      for (const result of [
        () => json({}, 403),
        () => json({ ...defaultFile, parents: ["other-folder"] })
      ]) {
        globalThis.fetch = async (url, init) => {
          if (new URL(String(url)).pathname.endsWith("/files/doc1")) return result();
          assert(!String(url).includes("/embeddings"));
          assert(!String(url).includes("/chat/completions"));
          return googleFetch(url, init);
        };
        assert.equal((await ask({ source: "both" })).status, 403);
      }
      mockGoogle();
    });

    await t.test("Invalid folders, legacy Word and oversized metadata fail explicitly", async () => {
      const googleFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => new URL(String(url)).pathname.endsWith(`/files/${folderId}`)
        ? json({ id: folderId, name: "Not a folder", mimeType: wordMime }) : googleFetch(url, init);
      assert.equal((await ask()).status, 422);
      for (const metadata of [
        { ...defaultFile, mimeType: "application/msword" },
        { ...defaultFile, size: String(5 * 1024 * 1024 + 1) }
      ]) {
        globalThis.fetch = async (url, init) => new URL(String(url)).pathname.endsWith("/files/doc1") ? json(metadata) : googleFetch(url, init);
        assert.equal((await ask()).status, 422);
      }
      mockGoogle();
    });

    await t.test("Invalid archives and extracted text above 60000 characters are rejected", async () => {
      const googleFetch = globalThis.fetch;
      for (const bytes of [Buffer.from("not a DOCX archive"), wordDocument("x".repeat(60_001))]) {
        globalThis.fetch = async (url, init) => new URL(String(url)).searchParams.get("alt") === "media" ? new Response(bytes) : googleFetch(url, init);
        assert.equal((await ask()).status, 422);
      }
      mockGoogle();
    });

    await t.test("Folder and file resource keys are carried into requests and source links", async () => {
      process.env.GOOGLE_DRIVE_FOLDER_RESOURCE_KEY = "public-folder-key";
      const googleFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        if (new URL(String(url)).hostname === "www.googleapis.com") {
          const header = new Headers(init?.headers).get("X-Goog-Drive-Resource-Keys") ?? "";
          assert.match(header, /public-policy-folder\/public-folder-key/);
          if (String(url).includes("alt=media")) assert.match(header, /doc1\/public-doc-key/);
          if (new URL(String(url)).pathname.endsWith("/files")) return json({ files: [{ ...defaultFile, resourceKey: "public-doc-key" }] });
          if (new URL(String(url)).pathname.endsWith("/files/doc1") && !String(url).includes("alt=media")) return json({ ...defaultFile, resourceKey: "public-doc-key" });
        }
        return googleFetch(url, init);
      };
      const response = await ask();
      assert.equal(response.status, 200);
      assert.equal((await response.json() as PolicyAnswer).citations[0].sourceUrl, "https://drive.google.com/file/d/doc1/view?resourcekey=public-doc-key");
      delete process.env.GOOGLE_DRIVE_FOLDER_RESOURCE_KEY;
      mockGoogle();
    });

    await t.test("Folder resource keys returned by metadata are used in discovery", async () => {
      const googleFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith(`/files/${folderId}`)) return json({
          id: folderId, name: "Public QA policies", mimeType: "application/vnd.google-apps.folder", resourceKey: "metadata-folder-key"
        });
        if (parsed.pathname.endsWith("/files")) {
          assert.match(new Headers(init?.headers).get("X-Goog-Drive-Resource-Keys") ?? "", /public-policy-folder\/metadata-folder-key/);
        }
        return googleFetch(url, init);
      };
      assert.equal((await get("/api/policy/drive/documents")).status, 200);
      mockGoogle();
    });

    await t.test("Caller folder overrides, document IDs and missing consent never trigger retrieval", async () => {
      globalThis.fetch = async () => { throw new Error("Caller input must be rejected before Google requests"); };
      assert.equal((await ask({ documentIds: ["outside-file"] })).status, 400);
      assert.equal((await ask({ allowDocumentAI: false })).status, 400);
      assert.equal((await get("/api/policy/drive/documents?folderId=outside-folder")).status, 400);
      mockGoogle();
    });

    await t.test("Invalid API keys and quotas return explicit configuration errors", async () => {
      for (const status of [401, 429]) {
        globalThis.fetch = async () => json({}, status);
        const response = await ask();
        assert.equal(response.status, 503);
        assert(!JSON.stringify(await response.json()).includes(apiKey));
      }
      mockGoogle();
    });

    await t.test("Legacy OAuth endpoints are gone and clear obsolete cookies", async () => {
      for (const path of ["connect", "callback", "disconnect"]) {
        const response = await originalFetch(`${base}/api/policy/drive/${path}`, { method: path === "callback" ? "GET" : "POST" });
        assert.equal(response.status, 410);
        assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
        assert.match((await response.json() as { message: string }).message, /public-folder retrieval/);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    restoreEnvironment(environment);
  }
});
