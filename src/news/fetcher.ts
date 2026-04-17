// ─────────────────────────────────────────────────────────────────────────────
// RSS Fetcher — parsuje kanały RSS polskich mediów
// Używa rss-parser z timeoutem 8s per źródło
// Błędy są logowane i zwracają pusty array (graceful degradation)
// ─────────────────────────────────────────────────────────────────────────────

import Parser from "rss-parser";

export interface Article {
  title: string;
  snippet: string;   // pierwsze 200 znaków opisu/treści
  pubDate: string;   // ISO string
  source: string;    // nazwa źródła
}

const parser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; LegionBot/1.0; +https://legion.lewandowski.agency)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
});

export async function fetchRSS(
  url: string,
  sourceName: string,
  maxItems = 20,
): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).slice(0, maxItems).map((item) => ({
      title: (item.title ?? "").trim().replace(/\s+/g, " "),
      snippet: (item.contentSnippet ?? item.content ?? item.summary ?? "")
        .slice(0, 200)
        .trim()
        .replace(/\s+/g, " "),
      pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
      source: sourceName,
    })).filter((a) => a.title.length > 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[news] ✗ ${sourceName} (${url}): ${msg}`);
    return [];
  }
}

export async function fetchAllSources(
  sources: Array<{ name: string; rssUrl: string }>,
): Promise<Map<string, Article[]>> {
  const results = new Map<string, Article[]>();

  await Promise.allSettled(
    sources.map(async ({ name, rssUrl }) => {
      const articles = await fetchRSS(rssUrl, name);
      results.set(name, articles);
      if (articles.length > 0) {
        console.log(`[news] ✓ ${name}: ${articles.length} artykułów`);
      }
    }),
  );

  return results;
}
