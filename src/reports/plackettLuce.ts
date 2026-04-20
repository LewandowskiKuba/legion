// ─────────────────────────────────────────────────────────────────────────────
// Plackett-Luce Analyzer — ranking N≥3 kreacji
//
// Signal 1 (w=0.6): opinie z symulacji → ranking indukowany przez score
// Signal 2 (w=0.4): pełny ranking porównawczy per persona (MultiRanker)
//
// MLE: algorytm MM (Hunter 2004) — iteracyjne skalowanie do konwergencji
// Global posterior: średnia geometryczna posteriorów per segment
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona } from "../personas/schema.js";
import type { MultiRankingResult } from "../engine/multiRanker.js";

const PL_THRESHOLD = 0.15;  // margin top1 - top2 < 15pp → rekomenduj test live
const MIN_SEGMENT_N = 10;
const W1 = 0.6;
const W2 = 0.4;

// ─── Typy ─────────────────────────────────────────────────────────────────────

export interface PLSegmentResult {
  label: string;
  key: string;
  n: number;
  probabilities: number[];  // P(kreacja i = najlepsza | segment), suma = 1
  winner: number;           // indeks kreacji z najwyższym P
  margin: number;           // P(1.) - P(2.)
  entropy: number;          // znorm. entropia Shannona ∈ [0,1]
  needsTest: boolean;
  avgOpinions: number[];    // średnia opinia per kreacja (-10..+10)
}

export interface PLDimensionResult {
  dimension: string;
  label: string;
  segments: PLSegmentResult[];
}

export interface PlackettLuceResult {
  globalProbabilities: number[];   // P(kreacja i = najlepsza globally)
  globalWinner: number;
  globalMargin: number;            // P(1.) - P(2.) globalnie
  confidenceLevel: "high" | "moderate" | "low";
  totalPersonas: number;
  creativeCount: number;
  creativeLabels: string[];        // np. ["Wariant A", "Wariant B", "Wariant C"]
  dimensions: PLDimensionResult[];
  rankingSignal: {
    firstChoiceCounts: number[];   // ile person wskazało kreację i jako nr 1
    totalRanked: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ageGroupKey(age: number): string {
  if (age < 25) return "18–24";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  if (age < 65) return "55–64";
  return "65+";
}

// Konwertuje wektor opinii na ranking (malejący wg score)
function opinionsToRanking(opinions: number[]): number[] {
  return Array.from({ length: opinions.length }, (_, i) => i)
    .sort((a, b) => opinions[b] - opinions[a]);
}

// ─── Plackett-Luce MLE (Hunter 2004 MM algorithm) ────────────────────────────
//
// Dla każdej iteracji:
//   W[m] = # rankingów gdzie kreacja m NIE jest ostatnia
//   C[m] = Σ_r Σ_{j=0}^{pos_r(m)} 1 / Σ_{k=j}^{N-1} p[r[k]]
//   p[m]_new = W[m] / C[m]  →  renormalizuj
//
function plackettLuceMLE(
  rankings: number[][], // rankings[i][j] = kreacja na pozycji j w rankingu i (0-based)
  N: number,
  maxIter = 500,
  tol = 1e-8,
): number[] {
  const n = rankings.length;
  if (n === 0) return new Array(N).fill(1 / N);

  // W[m] = # rankingów gdzie m nie jest ostatni
  const W = new Array(N).fill(0);
  for (const r of rankings) {
    const last = r[N - 1];
    for (let m = 0; m < N; m++) if (m !== last) W[m]++;
  }

  // Precompute: pos[ri][m] = pozycja kreacji m w rankingu ri
  const posCache = rankings.map((r) => {
    const p = new Array(N).fill(0);
    r.forEach((item, j) => { p[item] = j; });
    return p;
  });

  let p = new Array(N).fill(1 / N);

  for (let iter = 0; iter < maxIter; iter++) {
    // Suffix sums: S[ri][j] = Σ_{k=j}^{N-1} p[r[k]]
    const S = rankings.map((r) => {
      const s = new Array(N + 1).fill(0);
      for (let j = N - 1; j >= 0; j--) s[j] = s[j + 1] + p[r[j]];
      return s;
    });

    const newP = new Array(N).fill(0);
    for (let m = 0; m < N; m++) {
      let C = 0;
      for (let ri = 0; ri < n; ri++) {
        const pm = posCache[ri][m];
        const maxJ = Math.min(pm, N - 2); // ostatnia pozycja (N-1) nie wchodzi do likelihood
        for (let j = 0; j <= maxJ; j++) C += 1 / S[ri][j];
      }
      newP[m] = C > 0 ? W[m] / C : 0;
    }

    const sum = newP.reduce((s, x) => s + x, 0);
    if (sum <= 0) break;
    const norm = newP.map((x) => x / sum);

    const maxDiff = p.reduce((mx, x, i) => Math.max(mx, Math.abs(x - norm[i])), 0);
    p = norm;
    if (maxDiff < tol) break;
  }

  return p;
}

// ─── Posterior per segment ────────────────────────────────────────────────────

function computePLSegment(
  label: string,
  key: string,
  s1Rankings: number[][],
  s2Rankings: number[][],
  opinions: number[][],   // opinions[i][j] = opinia persony i dla kreacji j
  N: number,
): PLSegmentResult {
  const n = s1Rankings.length;

  if (n < MIN_SEGMENT_N) {
    return {
      label, key, n,
      probabilities: new Array(N).fill(1 / N),
      winner: 0, margin: 0, entropy: 1, needsTest: true,
      avgOpinions: new Array(N).fill(0),
    };
  }

  const p1 = plackettLuceMLE(s1Rankings, N);
  const p2 = plackettLuceMLE(s2Rankings, N);

  // Kombinacja sygnałów: W1 * Signal1 + W2 * Signal2, renormalizowana
  const combined = p1.map((v, i) => W1 * v + W2 * p2[i]);
  const sum = combined.reduce((s, x) => s + x, 0);
  const probabilities = sum > 0 ? combined.map((x) => x / sum) : new Array(N).fill(1 / N);

  const sorted = [...probabilities].sort((a, b) => b - a);
  const margin = sorted[0] - (sorted[1] ?? 0);

  const eps = 1e-10;
  const H = -probabilities.reduce((s, prob) => s + (prob > eps ? prob * Math.log(prob) : 0), 0);
  const entropy = N > 1 ? Math.min(1, H / Math.log(N)) : 0;

  const winner = probabilities.indexOf(Math.max(...probabilities));

  const avgOpinions = new Array(N).fill(0);
  for (let j = 0; j < N; j++) {
    avgOpinions[j] = opinions.reduce((s, op) => s + op[j], 0) / n;
  }

  return {
    label, key, n,
    probabilities, winner, margin, entropy,
    needsTest: margin < PL_THRESHOLD,
    avgOpinions,
  };
}

// ─── Wymiary segmentacji ─────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  gender:     "Płeć",
  ageGroup:   "Wiek",
  income:     "Dochód",
  settlement: "Typ miejscowości",
  political:  "Preferencje polityczne",
};

const SEGMENT_LABELS: Record<string, Record<string, string>> = {
  gender: { male: "Mężczyźni", female: "Kobiety" },
  ageGroup: {
    "18–24": "18–24 lat", "25–34": "25–34 lat", "35–44": "35–44 lat",
    "45–54": "45–54 lat", "55–64": "55–64 lat", "65+": "65+ lat",
  },
  income: {
    below_2000: "Poniżej 2 000 zł",
    "2000_3500": "2 000–3 500 zł",
    "3500_5000": "3 500–5 000 zł",
    "5000_8000": "5 000–8 000 zł",
    above_8000: "Powyżej 8 000 zł",
  },
  settlement: {
    village:     "Wieś",
    small_city:  "Małe miasto",
    medium_city: "Średnie miasto",
    large_city:  "Duże miasto",
    metropolis:  "Metropolia",
  },
  political: {
    pis: "PiS", ko: "KO", td: "TD", lewica: "Lewica",
    konfederacja: "Konfederacja", undecided: "Niezdecydowani", apolitical: "Apolityczni",
  },
};

// ─── Główna funkcja ──────────────────────────────────────────────────────────

export function computePlackettLuce(
  population: Persona[],
  opinionMaps: Record<string, number>[],  // jeden na kreację: personaId → opinia
  multiRankingResult: MultiRankingResult,
  creativeLabels: string[],
): PlackettLuceResult {
  const N = opinionMaps.length;

  // Tylko persony z opiniami we wszystkich symulacjach
  const paired = population.filter((p) =>
    opinionMaps.every((om) => om[p.id] !== undefined),
  );
  const totalPersonas = paired.length;

  type Bucket = {
    s1Rankings: number[][];
    s2Rankings: number[][];
    opinions: number[][];
  };

  const dims: Record<string, Record<string, Bucket>> = {
    gender: {}, ageGroup: {}, income: {}, settlement: {}, political: {},
  };

  for (const p of paired) {
    const ops = opinionMaps.map((om) => om[p.id]);

    // Signal 1: ranking indukowany przez score opinii
    const s1Ranking = opinionsToRanking(ops);

    // Signal 2: LLM ranking (fallback: sekwencyjny)
    const s2Ranking = multiRankingResult.rankings[p.id]
      ?? Array.from({ length: N }, (_, i) => i);

    const dimKeys: [string, string][] = [
      ["gender",     p.demographic.gender],
      ["ageGroup",   ageGroupKey(p.demographic.age)],
      ["income",     p.financial.incomeLevel],
      ["settlement", p.demographic.settlementType],
      ["political",  p.political.affiliation],
    ];

    for (const [dim, key] of dimKeys) {
      if (!dims[dim][key]) dims[dim][key] = { s1Rankings: [], s2Rankings: [], opinions: [] };
      dims[dim][key].s1Rankings.push(s1Ranking);
      dims[dim][key].s2Rankings.push(s2Ranking);
      dims[dim][key].opinions.push(ops);
    }
  }

  const dimensions: PLDimensionResult[] = Object.entries(dims).map(([dim, segments]) => ({
    dimension: dim,
    label: DIMENSION_LABELS[dim] ?? dim,
    segments: Object.entries(segments)
      .map(([key, b]) =>
        computePLSegment(
          SEGMENT_LABELS[dim]?.[key] ?? key,
          key,
          b.s1Rankings,
          b.s2Rankings,
          b.opinions,
          N,
        ),
      )
      .sort((a, b) => b.probabilities[b.winner] - a.probabilities[a.winner]),
  }));

  // Global posterior: średnia geometryczna per segment → renormalizacja
  const allSegments = dimensions.flatMap((d) => d.segments).filter((s) => s.n >= MIN_SEGMENT_N);

  let globalProbabilities: number[];

  if (allSegments.length === 0) {
    globalProbabilities = new Array(N).fill(1 / N);
  } else {
    const eps = 1e-6;
    const logSums = Array.from({ length: N }, (_, i) =>
      allSegments.reduce((s, seg) => s + Math.log(Math.max(seg.probabilities[i], eps)), 0),
    );
    const geos = logSums.map((ls) => Math.exp(ls / allSegments.length));
    const geoSum = geos.reduce((s, x) => s + x, 0);
    globalProbabilities = geoSum > 0 ? geos.map((g) => g / geoSum) : new Array(N).fill(1 / N);
  }

  const sortedByProb = [...globalProbabilities]
    .map((prob, i) => ({ prob, i }))
    .sort((a, b) => b.prob - a.prob);

  const globalWinner = sortedByProb[0].i;
  const globalMargin = sortedByProb[0].prob - (sortedByProb[1]?.prob ?? 0);

  const confidenceLevel: PlackettLuceResult["confidenceLevel"] =
    globalMargin >= 0.30 ? "high" :
    globalMargin >= 0.15 ? "moderate" :
    "low";

  return {
    globalProbabilities,
    globalWinner,
    globalMargin,
    confidenceLevel,
    totalPersonas,
    creativeCount: N,
    creativeLabels,
    dimensions,
    rankingSignal: {
      firstChoiceCounts: multiRankingResult.firstChoiceCounts,
      totalRanked: multiRankingResult.totalRanked,
    },
  };
}
