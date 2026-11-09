import { load } from "cheerio";
import { z } from "zod";
import { isMicrosoftDocumentationUrl } from "./screenshotService.js";
import { policyFetch, readPolicyBytes, readPolicyJson } from "./policyHttp.js";
import { PolicyError, type PolicyDocument } from "./policySchema.js";

export function allowedLearnUrl(value: string) {
  if (!isMicrosoftDocumentationUrl(value)) return false;
  const url = new URL(value);
  return !url.port || url.port === "443";
}

export function extractLearnArticle(html: string) {
  const $ = load(html);
  $("script, style, nav, aside, footer, header, form, svg, .feedback, .metadata, .visually-hidden").remove();
  const article = $("main .content").first().length ? $("main .content").first() : $("main").first();
  if (!article.length) throw new PolicyError("Microsoft Learn page does not contain a readable article.");
  article.find("br").replaceWith("\n");
  article.find("p, li, h1, h2, h3, h4, tr, pre").each((_index, element) => { $(element).append("\n"); });
  const text = article.text().replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) throw new PolicyError("Microsoft Learn article contains insufficient readable policy text.");
  if (text.length > 60_000) throw new PolicyError("Microsoft Learn article exceeds 60,000 characters. Refine the policy question.", 422);
  return text;
}

async function downloadArticle(initial: string) {
  let url = initial;
  for (let count = 0; count < 4; count++) {
    if (!allowedLearnUrl(url)) throw new PolicyError("Microsoft Learn returned an unapproved article URL.");
    const response = await policyFetch(url, { redirect: "manual", headers: { Accept: "text/html" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new PolicyError("Microsoft Learn returned an invalid redirect.");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new PolicyError("Microsoft Learn article could not be downloaded.");
    const html = (await readPolicyBytes(response, 2 * 1024 * 1024)).toString("utf8");
    return { text: extractLearnArticle(html), url };
  }
  throw new PolicyError("Microsoft Learn article redirected too many times.");
}

export async function retrieveLearnDocuments(question: string): Promise<{ documents: PolicyDocument[]; notices: string[] }> {
  const url = new URL("https://learn.microsoft.com/api/search");
  url.search = new URLSearchParams({ search: question, locale: "en-us", "$top": "5" }).toString();
  const response = await policyFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new PolicyError("Microsoft Learn search is unavailable or rate-limited.");
  const result = z.object({
    results: z.array(z.object({ title: z.string(), url: z.string() })).max(50)
  }).safeParse(await readPolicyJson(response));
  if (!result.success) throw new PolicyError("Microsoft Learn returned invalid search results.");
  const notices: string[] = [];
  const urls = new Set<string>();
  const candidates = result.data.results.filter((item) => {
    if (!allowedLearnUrl(item.url)) {
      notices.push("An unapproved search result URL was excluded.");
      return false;
    }
    if (urls.has(item.url)) return false;
    urls.add(item.url);
    return true;
  }).slice(0, 2);
  const documents = await Promise.all(candidates.map(async (item): Promise<PolicyDocument | null> => {
    try {
      const article = await downloadArticle(item.url);
      return { title: item.title, fileName: "learn.microsoft.com", kind: "learn", sourceUrl: article.url, text: article.text };
    } catch (error) {
      if (!(error instanceof PolicyError)) throw error;
      notices.push(`${item.title}: ${error.message}`);
      return null;
    }
  }));
  return { documents: documents.filter((item): item is PolicyDocument => item !== null), notices };
}
