// ─────────────────────────────────────────────────────────────────────────────
// RankerAgent — Signal 2 dla dual-signal Bayesa
//
// Każda persona widzi OBE kreacje naraz i wybiera którą preferuje.
// To jest porównanie relatywne (w izolacji mogły obie być "ok"),
// ale w zestawieniu jedna musi wygrać.
//
// Wynik: "A" | "B" | "tie" per persona → agregowany do rankingów per segment
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona, AdMaterial } from "../personas/schema.js";
import { buildSystemPrompt } from "./prompt.js";
import { selectModel } from "./modelRouter.js";
import { getPolymarketContext } from "../polymarket/index.js";

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "5", 10);
const MAX_RETRIES = 2;

export type RankPreference = "A" | "B" | "tie";

export interface PairRankingResult {
  rankings: Record<string, RankPreference>;  // personaId → preference
  countA: number;
  countB: number;
  countTie: number;
  totalRanked: number;
}

// ─── Prompt dla rankera ───────────────────────────────────────────────────────

function buildRankerUserPrompt(adA: AdMaterial, adB: AdMaterial): string {
  const formatAd = (ad: AdMaterial, label: string) => {
    const parts = [`[KREACJA ${label}]`];
    if (ad.brandName) parts.push(`Marka: ${ad.brandName}`);
    if (ad.headline) parts.push(`Nagłówek: ${ad.headline}`);
    if (ad.body)     parts.push(`Treść: ${ad.body}`);
    if (ad.cta)      parts.push(`CTA: ${ad.cta}`);
    if (ad.context)  parts.push(`Kontekst: ${ad.context}`);
    return parts.join("\n");
  };

  return `Właśnie zobaczyłeś/aś dwie reklamy. Oceń je jako konsument — która BARDZIEJ do Ciebie przemawia?

${formatAd(adA, "A")}

${formatAd(adB, "B")}

Odpowiedz WYŁĄCZNIE jednym słowem: A, B lub REMIS.
Nie tłumacz — tylko jedna litera lub słowo REMIS.`;
}

// ─── Wywołanie per persona ────────────────────────────────────────────────────

async function rankPair(
  persona: Persona,
  adA: AdMaterial,
  adB: AdMaterial,
  polyCtx: string,
  attempt = 0,
): Promise<RankPreference> {
  const model = selectModel(persona);
  const { provider, modelId, apiKey, baseURL } = model;

  const systemPrompt = buildSystemPrompt(persona, undefined, polyCtx);
  const userPrompt = buildRankerUserPrompt(adA, adB);

  try {
    let raw: string;

    if (provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
      const msg = await client.messages.create({
        model: modelId,
        max_tokens: 16,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      raw = msg.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("").trim().toUpperCase();
    } else {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({
        apiKey: apiKey ?? (provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY) ?? "",
        ...(baseURL ? { baseURL } : provider === "groq" ? { baseURL: "https://api.groq.com/openai/v1" } : {}),
      });
      const completion = await client.chat.completions.create({
        model: modelId,
        max_tokens: 16,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      raw = (completion.choices[0]?.message?.content ?? "").trim().toUpperCase();
    }

    if (raw.startsWith("A")) return "A";
    if (raw.startsWith("B")) return "B";
    return "tie";
  } catch (err: any) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return rankPair(persona, adA, adB, polyCtx, attempt + 1);
    }
    return "tie"; // fallback — błąd nie blokuje analizy
  }
}

// ─── Batch ranking dla całej populacji ───────────────────────────────────────

export async function runPairRanking(
  population: Persona[],
  adA: AdMaterial,
  adB: AdMaterial,
  onProgress?: (done: number, total: number) => void,
): Promise<PairRankingResult> {
  const polyCtx = await getPolymarketContext();
  const rankings: Record<string, RankPreference> = {};
  let done = 0;

  // Worker pool — identyczny wzorzec co runPersonaBatch
  const queue = [...population];

  async function worker() {
    while (queue.length > 0) {
      const persona = queue.shift();
      if (!persona) break;
      rankings[persona.id] = await rankPair(persona, adA, adB, polyCtx);
      done++;
      onProgress?.(done, population.length);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const countA   = Object.values(rankings).filter((r) => r === "A").length;
  const countB   = Object.values(rankings).filter((r) => r === "B").length;
  const countTie = Object.values(rankings).filter((r) => r === "tie").length;

  return { rankings, countA, countB, countTie, totalRanked: population.length };
}
