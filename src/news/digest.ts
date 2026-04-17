// ─────────────────────────────────────────────────────────────────────────────
// News Digest — buduje i cache'uje podsumowanie per segment społeczny
//
// Digest = zestaw nagłówków + moodModifier + gotowy blok tekstowy do wstrzyknięcia
// w system prompt persony.
//
// Sentiment: proste keyword matching (PL) bez LLM — wystarczające do kalibracji nastroju
// Cache: JSON na dysku w data/news/digest-latest.json, in-memory po wczytaniu
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { PoliticalAffiliation } from "../personas/schema.js";
import {
  ALL_SOURCES, getDiet, ageSegment,
  AFFILIATIONS, AGE_SEGMENTS,
  type AgeSegment,
} from "./sources.js";
import { fetchAllSources, type Article } from "./fetcher.js";

const NEWS_DIR = join(process.cwd(), "data", "news");

// ─── Typy ────────────────────────────────────────────────────────────────────

export interface NewsDigest {
  segmentKey: string;      // np. "pis-senior"
  generatedAt: string;     // ISO timestamp
  headlines: string[];     // top 10 nagłówków z diety
  moodModifier: number;    // -1..+1 (negatywny..pozytywny nastrój informacyjny)
  contextBlock: string;    // gotowy blok do wstrzyknięcia w system prompt
}

export interface DigestCache {
  generatedAt: string;
  totalArticles: number;
  sourcesOk: number;
  segments: Record<string, NewsDigest>;
}

// ─── Słownik sentymentu (PL) ──────────────────────────────────────────────────

const POSITIVE_PL = [
  "wzrost", "sukces", "poprawa", "dobry", "dobra", "dobre", "zwycięstwo",
  "wzrósł", "wzrosła", "wzrosły", "zysk", "boom", "stabilizacja",
  "porozumienie", "nadzieja", "rekord", "postęp", "szansa", "ożywienie",
  "otwarcie", "przełom", "wzrost", "dobrobyt", "odbudowa", "pomoc",
];

const NEGATIVE_PL = [
  "kryzys", "skandal", "atak", "śmierć", "zginął", "zginęła", "katastrofa",
  "dramat", "spadek", "stracił", "porażka", "ofiary", "przemoc", "wypadek",
  "korupcja", "zagrożenie", "problem", "trudności", "zarzuty", "protest",
  "strajk", "bankructwo", "recesja", "inflacja", "drożyzna", "bezrobocie",
  "afera", "tragedia", "kryzys", "spór", "kontrowersje", "oskarżenia", "areszt",
];

function sentimentScore(text: string): number {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POSITIVE_PL) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE_PL) if (lower.includes(w)) neg++;
  const total = pos + neg;
  if (total === 0) return 0;
  return (pos - neg) / total;
}

// ─── Budowanie digestu per segment ───────────────────────────────────────────

function buildSegmentDigest(
  affiliation: PoliticalAffiliation,
  ageSeg: AgeSegment,
  articlesBySource: Map<string, Article[]>,
): NewsDigest {
  const key = `${affiliation}-${ageSeg}`;
  const diet = getDiet(affiliation, ageSeg);

  // Zbieramy artykuły proporcjonalnie do wagi źródła
  const MAX_HEADLINES = 10;
  const pickedHeadlines: string[] = [];

  for (const source of diet) {
    const arts = articlesBySource.get(source.name) ?? [];
    if (arts.length === 0) continue;
    // Ile artykułów ze źródła = ceil(weight * MAX_HEADLINES), min 1
    const count = Math.max(1, Math.round(source.weight * MAX_HEADLINES));
    arts.slice(0, count).forEach((a) => {
      if (a.title && !pickedHeadlines.includes(a.title)) {
        pickedHeadlines.push(a.title);
      }
    });
  }

  // Mood: ważona suma (tonalność źródła × 0.4 + sentiment nagłówków × 0.6)
  let moodSum = 0, moodWeight = 0;
  for (const source of diet) {
    const arts = articlesBySource.get(source.name) ?? [];
    if (arts.length === 0) continue;
    const avgSent = arts.reduce(
      (s, a) => s + sentimentScore(`${a.title} ${a.snippet}`), 0,
    ) / arts.length;
    const combined = 0.4 * source.tonality + 0.6 * avgSent;
    moodSum += combined * source.weight;
    moodWeight += source.weight;
  }
  const moodModifier = moodWeight > 0 ? Math.max(-1, Math.min(1, moodSum / moodWeight)) : 0;

  const moodLabel =
    moodModifier > 0.15  ? "pozytywny" :
    moodModifier < -0.15 ? "negatywny" : "mieszany";

  const datePL = new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  const headlineList = pickedHeadlines
    .slice(0, MAX_HEADLINES)
    .map((h, i) => `${i + 1}. ${h}`)
    .join("\n");

  const contextBlock =
    `## Aktualne informacje w Twoich mediach (${datePL})\n` +
    `Ogólny nastrój informacyjny: ${moodLabel}\n` +
    (headlineList
      ? `Tematy z Twoich mediów:\n${headlineList}`
      : `(brak bieżących danych — reagujesz na podstawie ogólnej wiedzy)`);

  return {
    segmentKey: key,
    generatedAt: new Date().toISOString(),
    headlines: pickedHeadlines.slice(0, MAX_HEADLINES),
    moodModifier,
    contextBlock,
  };
}

// ─── Główna funkcja odświeżania ───────────────────────────────────────────────

export async function refreshDigests(): Promise<DigestCache> {
  mkdirSync(NEWS_DIR, { recursive: true });

  console.log(`[news] Odświeżanie digestów — ${new Date().toLocaleString("pl-PL")}`);

  // Fetch wszystkich unikalnych źródeł
  const articlesBySource = await fetchAllSources(
    ALL_SOURCES.map(({ name, rssUrl }) => ({ name, rssUrl })),
  );

  const sourcesOk = [...articlesBySource.values()].filter((a) => a.length > 0).length;
  const totalArticles = [...articlesBySource.values()].reduce((s, a) => s + a.length, 0);
  console.log(`[news] Źródła: ${sourcesOk}/${ALL_SOURCES.length} OK, ${totalArticles} artykułów`);

  // Buduj digest per segment
  const segments: Record<string, NewsDigest> = {};
  for (const aff of AFFILIATIONS) {
    for (const ageSeg of AGE_SEGMENTS) {
      const digest = buildSegmentDigest(aff, ageSeg, articlesBySource);
      segments[digest.segmentKey] = digest;
    }
  }

  const cache: DigestCache = {
    generatedAt: new Date().toISOString(),
    totalArticles,
    sourcesOk,
    segments,
  };

  const cachePath = join(NEWS_DIR, "digest-latest.json");
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
  console.log(`[news] Digest zapisany → ${cachePath} (${Object.keys(segments).length} segmentów)`);

  // Unieważnij in-memory cache
  invalidateDigestCache();

  return cache;
}

// ─── Odczyt cache ─────────────────────────────────────────────────────────────

let _cache: DigestCache | null = null;

export function getDigestCache(): DigestCache | null {
  if (_cache) return _cache;
  const cachePath = join(NEWS_DIR, "digest-latest.json");
  if (!existsSync(cachePath)) return null;
  try {
    _cache = JSON.parse(readFileSync(cachePath, "utf8")) as DigestCache;
    return _cache;
  } catch {
    return null;
  }
}

export function invalidateDigestCache(): void {
  _cache = null;
}

// ─── API dla systemu promptów ─────────────────────────────────────────────────

export function getSegmentDigest(
  affiliation: PoliticalAffiliation,
  age: number,
): NewsDigest | null {
  const cache = getDigestCache();
  if (!cache) return null;
  const key = `${affiliation}-${ageSegment(age)}`;
  return cache.segments[key] ?? null;
}

export function getDigestStats(): { generatedAt: string; sourcesOk: number; totalArticles: number } | null {
  const cache = getDigestCache();
  if (!cache) return null;
  return {
    generatedAt: cache.generatedAt,
    sourcesOk: cache.sourcesOk,
    totalArticles: cache.totalArticles,
  };
}
