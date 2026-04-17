import type { PolymarketMarket, RelevantMarket } from "./types.js";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h
const FETCH_LIMIT = 500;

// Word-boundary keywords (won't match mid-word)
const WORD_KEYWORDS = [
  "poland", "polish", "polska", "europe", "european", "nato",
  "ukraine", "russia", "inflation", "recession", "ceasefire",
  "sanctions", "germany", "france", "china", "tariff", "war",
  "fed", "ecb", "euro",
];

// Substring keywords (phrase-level, safe without word boundaries)
const PHRASE_KEYWORDS = [
  "european union", "oil price", "gas price", "interest rate",
  "gdp growth", "trump tariff", "ukraine ceasefire",
];

let cache: { markets: RelevantMarket[]; fetchedAt: number } | null = null;

function isRelevant(market: PolymarketMarket): boolean {
  const q = market.question.toLowerCase();
  if (PHRASE_KEYWORDS.some((kw) => q.includes(kw))) return true;
  return WORD_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(q));
}

function parseMarket(market: PolymarketMarket): RelevantMarket | null {
  const rawPrices = typeof market.outcomePrices === "string"
    ? JSON.parse(market.outcomePrices)
    : market.outcomePrices;
  const rawOutcomes = typeof market.outcomes === "string"
    ? JSON.parse(market.outcomes)
    : market.outcomes;

  const prices: number[] = (rawPrices ?? []).map(Number).filter((p: number) => !isNaN(p));
  if (prices.length === 0) return null;

  const maxIdx = prices.indexOf(Math.max(...prices));
  const outcome = rawOutcomes?.[maxIdx];
  if (!outcome) return null;

  return {
    question: market.question,
    leadingOutcome: outcome,
    probability: Math.round(prices[maxIdx] * 100),
  };
}

export async function fetchRelevantMarkets(): Promise<RelevantMarket[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.markets;

  const url = `${GAMMA_API}/markets?active=true&closed=false&limit=${FETCH_LIMIT}`;

  let raw: PolymarketMarket[];
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json() as PolymarketMarket[];
  } catch (err) {
    console.warn("[polymarket] fetch failed:", err);
    return cache?.markets ?? [];
  }

  const relevant = raw
    .filter((m) => m.active && !m.closed && isRelevant(m))
    .sort((a, b) => (parseFloat(String(b.volume)) || 0) - (parseFloat(String(a.volume)) || 0))
    .slice(0, 20)
    .map(parseMarket)
    .filter((m): m is RelevantMarket => m !== null);

  cache = { markets: relevant, fetchedAt: now };
  return relevant;
}

export function getCachedMarkets(): RelevantMarket[] {
  return cache?.markets ?? [];
}

export function getCacheAge(): number | null {
  return cache ? Date.now() - cache.fetchedAt : null;
}
