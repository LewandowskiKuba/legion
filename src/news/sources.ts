// ─────────────────────────────────────────────────────────────────────────────
// Mapa diety medialnej per segment społeczny
//
// Segmentacja: political affiliation × age bracket
//   young  = 18–34  (online-first, social media)
//   mid    = 35–54  (mix tradycja + online)
//   senior = 55+    (TV, portale mainstreams)
//
// Każde źródło ma:
//   weight   — relatywna waga w diecie (normalizowana do 1.0)
//   tonality — bazowy nastrój źródła (-1 negatywny .. +1 pozytywny)
// ─────────────────────────────────────────────────────────────────────────────

import type { PoliticalAffiliation } from "../personas/schema.js";

export type AgeSegment = "young" | "mid" | "senior";

export interface NewsSource {
  name: string;
  rssUrl: string;
  tonality: number;   // -1..+1 baseline tonality of the source
}

export interface DietSource extends NewsSource {
  weight: number;     // normalized 0..1, sum = 1.0 in segment
}

// ─── Wszystkie źródła ─────────────────────────────────────────────────────────

export const ALL_SOURCES: NewsSource[] = [
  { name: "wPolityce",   rssUrl: "https://wpolityce.pl/rss",                              tonality: -0.25 },
  { name: "DoRzeczy",    rssUrl: "https://dorzeczy.pl/feed/",                             tonality: -0.30 },
  { name: "Niezalezna",  rssUrl: "https://niezalezna.pl/feed/",                           tonality: -0.30 },
  { name: "Gazeta",      rssUrl: "https://rss.gazeta.pl/pub/rss/najnowsze_kraj.xml",      tonality: -0.15 },
  { name: "TVN24",       rssUrl: "https://tvn24.pl/najnowsze.xml",                        tonality: -0.15 },
  { name: "OKO",         rssUrl: "https://oko.press/feed/",                               tonality: -0.20 },
  { name: "Onet",        rssUrl: "https://wiadomosci.onet.pl/.feed/rss",                  tonality: -0.10 },
  { name: "WP",          rssUrl: "https://wiadomosci.wp.pl/rss.xml",                      tonality: -0.10 },
  { name: "Interia",     rssUrl: "https://fakty.interia.pl/feed",                         tonality: -0.10 },
  { name: "Polsat",      rssUrl: "https://www.polsatnews.pl/rss/wszystkie.xml",           tonality: -0.10 },
];

// ─── Bazowe diety per affiliation ─────────────────────────────────────────────
// weight = relatywna waga (przed normalizacją)

type RawDiet = Array<{ name: string; weight: number }>;

const DIET_BY_AFFILIATION: Record<PoliticalAffiliation, RawDiet> = {
  pis:          [ { name: "wPolityce", weight: 3 }, { name: "DoRzeczy", weight: 2 }, { name: "Niezalezna", weight: 2 }, { name: "Onet", weight: 1 } ],
  ko:           [ { name: "Gazeta",    weight: 3 }, { name: "TVN24",    weight: 3 }, { name: "Onet",       weight: 2 }, { name: "WP",    weight: 1 } ],
  td:           [ { name: "Onet",      weight: 3 }, { name: "WP",       weight: 3 }, { name: "Interia",    weight: 2 }, { name: "Gazeta", weight: 2 } ],
  lewica:       [ { name: "OKO",       weight: 4 }, { name: "Gazeta",   weight: 3 }, { name: "TVN24",      weight: 2 }, { name: "Onet",  weight: 1 } ],
  konfederacja: [ { name: "DoRzeczy",  weight: 2 }, { name: "Niezalezna", weight: 2 }, { name: "WP",       weight: 2 }, { name: "Onet",  weight: 1 } ],
  undecided:    [ { name: "Onet",      weight: 3 }, { name: "WP",       weight: 3 }, { name: "Interia",    weight: 2 }, { name: "TVN24", weight: 2 } ],
  apolitical:   [ { name: "Onet",      weight: 4 }, { name: "WP",       weight: 4 }, { name: "Interia",    weight: 2 }, { name: "Polsat", weight: 1 } ],
};

// ─── Korektory wagowe per age segment ────────────────────────────────────────
// Młodsi → bardziej online (Gazeta, OKO), starsi → TV-style (Polsat, TVN24)

const AGE_WEIGHT_MULT: Record<AgeSegment, Record<string, number>> = {
  young:  { OKO: 1.6, Gazeta: 1.3, WP: 1.2, TVN24: 0.7, Polsat: 0.5, wPolityce: 0.7, DoRzeczy: 0.7 },
  mid:    {},  // baseline — bez korekt
  senior: { TVN24: 1.5, Polsat: 1.6, Onet: 1.2, Interia: 1.3, OKO: 0.5, DoRzeczy: 0.7 },
};

// ─── Eksportowane helpery ─────────────────────────────────────────────────────

export function ageSegment(age: number): AgeSegment {
  if (age < 35) return "young";
  if (age < 55) return "mid";
  return "senior";
}

export function segmentKey(affiliation: PoliticalAffiliation, age: number): string {
  return `${affiliation}-${ageSegment(age)}`;
}

export function getDiet(
  affiliation: PoliticalAffiliation,
  ageSeg: AgeSegment,
): DietSource[] {
  const rawDiet = DIET_BY_AFFILIATION[affiliation] ?? DIET_BY_AFFILIATION.apolitical;
  const mults = AGE_WEIGHT_MULT[ageSeg];

  const sourceMap = new Map(ALL_SOURCES.map((s) => [s.name, s]));

  const adjusted = rawDiet
    .map(({ name, weight }) => {
      const src = sourceMap.get(name);
      if (!src) return null;
      return { ...src, weight: weight * (mults[name] ?? 1) };
    })
    .filter((x): x is DietSource & { weight: number } => x !== null);

  const total = adjusted.reduce((s, x) => s + x.weight, 0);
  return adjusted.map((s) => ({ ...s, weight: s.weight / total }));
}

// Wszystkie unikalne kombinacje segmentów do wygenerowania
export const AFFILIATIONS = Object.keys(DIET_BY_AFFILIATION) as PoliticalAffiliation[];
export const AGE_SEGMENTS: AgeSegment[] = ["young", "mid", "senior"];
