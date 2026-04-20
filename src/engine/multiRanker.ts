// ─────────────────────────────────────────────────────────────────────────────
// MultiRankerAgent — Signal 2 dla Plackett-Luce N≥3
//
// Każda persona widzi wszystkie N kreacji naraz i uszeregowuje je
// od najbardziej do najmniej atrakcyjnej.
// Wynik: pełny ranking 0-based per persona → MLE Plackett-Luce
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona, AdMaterial } from "../personas/schema.js";
import { buildSystemPrompt } from "./prompt.js";
import { selectModel } from "./modelRouter.js";
import { getPolymarketContext } from "../polymarket/index.js";

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "5", 10);
const MAX_RETRIES = 2;

export interface MultiRankingResult {
  rankings: Record<string, number[]>; // personaId → [best_idx, ..., worst_idx] (0-based)
  firstChoiceCounts: number[];        // [i] = # person, które wybrały kreację i jako najlepszą
  totalRanked: number;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildMultiRankerPrompt(ads: AdMaterial[]): string {
  const formatAd = (ad: AdMaterial, num: number) => {
    const parts = [`[KREACJA ${num}]`];
    if (ad.brandName) parts.push(`Marka: ${ad.brandName}`);
    if (ad.headline)  parts.push(`Nagłówek: ${ad.headline}`);
    if (ad.body)      parts.push(`Treść: ${ad.body}`);
    if (ad.cta)       parts.push(`CTA: ${ad.cta}`);
    if (ad.context)   parts.push(`Kontekst: ${ad.context}`);
    return parts.join("\n");
  };

  const adsText = ads.map((ad, i) => formatAd(ad, i + 1)).join("\n\n");

  const exampleMap: Record<number, string> = {
    3: "2,1,3",
    4: "3,1,4,2",
    5: "1,3,2,5,4",
  };
  const example = exampleMap[ads.length] ?? "1,2,3";

  return `Właśnie zobaczyłeś/aś ${ads.length} reklamy. Oceń je jako konsument — uszereguj od najbardziej do najmniej atrakcyjnej.

${adsText}

Odpowiedz WYŁĄCZNIE ${ads.length} cyframi oddzielonymi przecinkami (np. ${example}), od najlepszej do najgorszej kreacji.
Nie tłumacz — tylko cyfry w kolejności preferencji.`;
}

// ─── Parser odpowiedzi ────────────────────────────────────────────────────────

function parseRanking(raw: string, N: number): number[] {
  const nums = raw
    .replace(/[^0-9,\s]/g, "")
    .split(/[,\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= N);

  const unique = [...new Set(nums)];
  if (unique.length === N) {
    return unique.map((n) => n - 1); // 1-indexed → 0-indexed
  }
  // Fallback: kolejność neutralna (bez preferencji)
  return Array.from({ length: N }, (_, i) => i);
}

// ─── Wywołanie per persona ────────────────────────────────────────────────────

async function rankAll(
  persona: Persona,
  ads: AdMaterial[],
  polyCtx: string,
  attempt = 0,
): Promise<number[]> {
  const N = ads.length;
  const model = selectModel(persona);
  const { provider, modelId, apiKey, baseURL } = model;

  const systemPrompt = buildSystemPrompt(persona, undefined, polyCtx);
  const userPrompt = buildMultiRankerPrompt(ads);

  try {
    let raw: string;

    if (provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: modelId,
        max_tokens: 32,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      raw = msg.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("").trim();
    } else {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({
        apiKey: apiKey ?? (provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY) ?? "",
        ...(baseURL ? { baseURL } : provider === "groq" ? { baseURL: "https://api.groq.com/openai/v1" } : {}),
      });
      const completion = await client.chat.completions.create({
        model: modelId,
        max_tokens: 32,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim();
    }

    return parseRanking(raw, N);
  } catch (err: any) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return rankAll(persona, ads, polyCtx, attempt + 1);
    }
    return Array.from({ length: N }, (_, i) => i); // fallback: sekwencyjny
  }
}

// ─── Batch dla całej populacji ────────────────────────────────────────────────

export async function runMultiRanking(
  population: Persona[],
  ads: AdMaterial[],
  onProgress?: (done: number, total: number) => void,
): Promise<MultiRankingResult> {
  const N = ads.length;
  const polyCtx = await getPolymarketContext();
  const rankings: Record<string, number[]> = {};
  let done = 0;

  const queue = [...population];

  async function worker() {
    while (queue.length > 0) {
      const persona = queue.shift();
      if (!persona) break;
      rankings[persona.id] = await rankAll(persona, ads, polyCtx);
      done++;
      onProgress?.(done, population.length);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const firstChoiceCounts = new Array(N).fill(0);
  for (const ranking of Object.values(rankings)) {
    if (ranking.length > 0) firstChoiceCounts[ranking[0]]++;
  }

  return { rankings, firstChoiceCounts, totalRanked: population.length };
}
