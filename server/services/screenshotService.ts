import type { ScreenshotReference } from "../types.js";

export function isMicrosoftDocumentationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "learn.microsoft.com" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function findScreenshots(feature: string, platform: string): Promise<{ screenshots: ScreenshotReference[]; notice: string }> {
  try {
    const search = new URL("https://learn.microsoft.com/api/search");
    search.searchParams.set("search", `Microsoft Teams ${platform} ${feature} mobile`);
    search.searchParams.set("locale", "en-us");
    search.searchParams.set("$top", "3");
    const response = await fetch(search, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!response.ok) throw new Error(`Microsoft Learn search returned ${response.status}`);
    const data = await response.json() as { results?: Array<{ title?: string; url?: string }> };
    const screenshots: ScreenshotReference[] = [];
    for (const result of (data.results ?? []).slice(0, 3)) {
      if (!result.url || !isMicrosoftDocumentationUrl(result.url) || !/teams/i.test(result.title ?? "")) continue;
      const page = await fetch(result.url, { signal: AbortSignal.timeout(8000), redirect: "error" });
      if (!page.ok) continue;
      const html = await page.text();
      const article = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? "";
      for (const match of article.matchAll(/<img\b[^>]*>/gi)) {
        const tag = match[0];
        const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
        const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "";
        if (!src || !new RegExp(platform, "i").test(`${alt} ${src}`) || /logo|icon|avatar/i.test(`${alt} ${src}`)) continue;
        const url = new URL(src.replace(/&amp;/g, "&"), result.url).href;
        if (!isMicrosoftDocumentationUrl(url) || !/\.(png|jpe?g|webp)(\?|$)/i.test(url)) continue;
        screenshots.push({ url, sourceUrl: result.url, title: alt || result.title || `Teams ${platform} reference` });
        if (screenshots.length === 2) break;
      }
      if (screenshots.length === 2) break;
    }
    return {
      screenshots,
      notice: screenshots.length
        ? "Microsoft documentation images are reference material, not evidence that these tests passed. Confirm feature and version relevance."
        : "No matching mobile screenshot found in Microsoft documentation. Attach real device evidence after execution; no synthetic screenshots were generated."
    };
  } catch (error) {
    console.warn("Screenshot reference lookup failed:", error instanceof Error ? error.message : "Unknown retrieval error");
    return { screenshots: [], notice: "Screenshot lookup unavailable. Generate cases without references or attach real device evidence later." };
  }
}
