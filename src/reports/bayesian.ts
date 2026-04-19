// ─────────────────────────────────────────────────────────────────────────────
// Bayesian A/B Analyzer
//
// Odtworzone na podstawie metodyki z raportu pre-testingu kreacji:
//   Prior: P(A=best) = P(B=best) = 0.5  (równy prior dla obu wariantów)
//   Evidence: per-persona likelihood ratio z agentOpinions (-10..+10)
//   Update: posterior ∝ prior × L_avg (dla N=2 prior się skraca)
//   Global: średnia geometryczna posteriorów per segment (penalizuje niespójność)
//   Uncertainty: entropia Shannona znormalizowana H/log(2) ∈ [0,1]
//   A/B flag: margin < AB_THRESHOLD (15 pp)
//
// Zero wywołań LLM — czysta matematyka na danych z simulationStore.
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona } from "../personas/schema.js";
import type { RankPreference, PairRankingResult } from "../engine/ranker.js";

// ─── Typy ─────────────────────────────────────────────────────────────────────

const AB_THRESHOLD = 0.15;   // margin < 15 pp → rekomenduj live A/B
const MIN_SEGMENT_N = 10;    // minimalna liczba person w segmencie

export interface SegmentPosterior {
  label: string;          // etykieta czytelna dla człowieka
  key: string;            // klucz segmentu (np. "female", "18–24")
  n: number;              // liczba person w segmencie
  posteriorA: number;     // P(A = najlepsza kreacja | ten segment) ∈ [0,1]
  posteriorB: number;     // P(B = najlepsza kreacja | ten segment)
  margin: number;         // |posteriorA − posteriorB|
  entropy: number;        // znormalizowana entropia Shannona ∈ [0,1]
  needsAB: boolean;       // true gdy margin < AB_THRESHOLD
  winner: "A" | "B";
  avgOpinionA: number;    // średnia opinia dla kreacji A (-10..+10)
  avgOpinionB: number;
}

export interface DimensionResult {
  dimension: string;      // klucz wymiaru (np. "gender")
  label: string;          // czytelna etykieta (np. "Płeć")
  segments: SegmentPosterior[];
}

export interface BayesianABResult {
  globalPosteriorA: number;       // średnia geometryczna po segmentach → renorm
  globalPosteriorB: number;
  globalMargin: number;
  globalWinner: "A" | "B" | "uncertain";
  globalNeedsAB: boolean;
  confidenceLevel: "high" | "moderate" | "low";
  totalPersonas: number;          // łączna liczba person z parowanych opinii
  dimensions: DimensionResult[];  // wyniki per wymiar demograficzny
  priorityAB: Array<{             // segmenty sortowane wg niepewności (do live A/B)
    dimension: string;
    dimensionLabel: string;
    label: string;
    entropy: number;
    margin: number;
    winner: "A" | "B";
    winnerPosterior: number;
    runnerUpPosterior: number;
    n: number;
  }>;
}

export interface DualSignalResult extends BayesianABResult {
  // Signal 1 — wyniki z symulacji (agentOpinions)
  signal1: Pick<BayesianABResult, "globalPosteriorA" | "globalPosteriorB" | "globalWinner" | "globalMargin">;
  // Signal 2 — wyniki z rankowania porównawczego
  signal2: {
    globalPosteriorA: number;
    globalPosteriorB: number;
    globalWinner: "A" | "B" | "uncertain";
    globalMargin: number;
    countA: number;
    countB: number;
    countTie: number;
    totalRanked: number;
  };
  // Czy sygnały są zgodne?
  signalAgreement: "agree" | "disagree" | "weak";
  // Wagi użyte do łączenia
  weights: { signal1: number; signal2: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ageGroupKey(age: number): string {
  if (age < 25) return "18–24";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  if (age < 65) return "55–64";
  return "65+";
}

// Mapuje opinię (-10..+10) na prawdopodobieństwo [ε, 1-ε]
// Epsilon zapobiega log(0) w obliczeniach entropii
function opinionToProb(op: number): number {
  return Math.max(0.01, Math.min(0.99, (op + 10) / 20));
}

// ─── Rdzeń Bayesa per segment ─────────────────────────────────────────────────
//
// Algorytm dla N=2 kreacji:
//   Dla każdej persony i:  ratio_i = scoreA_i / (scoreA_i + scoreB_i)
//   L_A = mean(ratio_i)  →  "średni udział preferencji A"
//   Prior = 0.5 dla obu → skraca się → posterior_A = L_A
//
// Shannon entropy (N=2): H = -(p log p + (1-p) log(1-p)), znorm. / log(2)
//
function computeSegmentPosterior(
  label: string,
  key: string,
  scoresA: number[],
  scoresB: number[],
  opinionsA: number[],
  opinionsB: number[],
): SegmentPosterior {
  const n = scoresA.length;

  if (n < MIN_SEGMENT_N) {
    // Za mało person — zwróć neutralny wynik
    return {
      label, key, n,
      posteriorA: 0.5, posteriorB: 0.5,
      margin: 0, entropy: 1, needsAB: true,
      winner: "A",
      avgOpinionA: 0, avgOpinionB: 0,
    };
  }

  // Średni iloraz preferencji per persona
  const ratios = scoresA.map((sA, i) => sA / (sA + scoresB[i]));
  const posteriorA = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const posteriorB = 1 - posteriorA;

  // Entropia Shannona znormalizowana (N=2, max = log(2))
  const eps = 1e-10;
  const H = -(
    posteriorA * Math.log(Math.max(posteriorA, eps)) +
    posteriorB * Math.log(Math.max(posteriorB, eps))
  );
  const entropy = Math.min(1, H / Math.log(2));

  const margin = Math.abs(posteriorA - posteriorB);
  const avgOpinionA = opinionsA.reduce((s, o) => s + o, 0) / n;
  const avgOpinionB = opinionsB.reduce((s, o) => s + o, 0) / n;

  return {
    label, key, n,
    posteriorA, posteriorB,
    margin, entropy,
    needsAB: margin < AB_THRESHOLD,
    winner: posteriorA >= posteriorB ? "A" : "B",
    avgOpinionA, avgOpinionB,
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

// ─── Główna funkcja ────────────────────────────────────────────────────────────

export function computeBayesianAB(
  population: Persona[],
  opinionsA: Record<string, number>,
  opinionsB: Record<string, number>,
): BayesianABResult {
  // Buduj zbióry per persona (tylko te, które mają opinię w obu symulacjach)
  const paired = population.filter(
    (p) => opinionsA[p.id] !== undefined && opinionsB[p.id] !== undefined,
  );

  const totalPersonas = paired.length;

  // Grupuj po wymiarach
  type Bucket = { scoresA: number[]; scoresB: number[]; opinionsA: number[]; opinionsB: number[] };

  const dims: Record<string, Record<string, Bucket>> = {
    gender: {}, ageGroup: {}, income: {}, settlement: {}, political: {},
  };

  for (const p of paired) {
    const opA = opinionsA[p.id];
    const opB = opinionsB[p.id];
    const sA = opinionToProb(opA);
    const sB = opinionToProb(opB);

    const keys: [string, string][] = [
      ["gender",     p.demographic.gender],
      ["ageGroup",   ageGroupKey(p.demographic.age)],
      ["income",     p.financial.incomeLevel],
      ["settlement", p.demographic.settlementType],
      ["political",  p.political.affiliation],
    ];

    for (const [dim, key] of keys) {
      if (!dims[dim][key]) {
        dims[dim][key] = { scoresA: [], scoresB: [], opinionsA: [], opinionsB: [] };
      }
      dims[dim][key].scoresA.push(sA);
      dims[dim][key].scoresB.push(sB);
      dims[dim][key].opinionsA.push(opA);
      dims[dim][key].opinionsB.push(opB);
    }
  }

  // Oblicz posteriors per wymiar
  const dimensions: DimensionResult[] = Object.entries(dims).map(([dim, segments]) => ({
    dimension: dim,
    label: DIMENSION_LABELS[dim] ?? dim,
    segments: Object.entries(segments).map(([key, b]) =>
      computeSegmentPosterior(
        SEGMENT_LABELS[dim]?.[key] ?? key,
        key, b.scoresA, b.scoresB, b.opinionsA, b.opinionsB,
      )
    ).sort((a, b) => b.posteriorA - a.posteriorA),
  }));

  // Global posterior — średnia geometryczna posteriorów per segment (wymagająca)
  // Kreacja musi być spójnie dobra we WSZYSTKICH segmentach (nie tylko dominować w jednym)
  const allSegments = dimensions.flatMap((d) => d.segments).filter((s) => s.n >= MIN_SEGMENT_N);

  let globalPosteriorA: number;
  let globalPosteriorB: number;

  if (allSegments.length === 0) {
    globalPosteriorA = 0.5;
    globalPosteriorB = 0.5;
  } else {
    const eps = 1e-6;
    const logSumA = allSegments.reduce((s, seg) => s + Math.log(Math.max(seg.posteriorA, eps)), 0);
    const logSumB = allSegments.reduce((s, seg) => s + Math.log(Math.max(seg.posteriorB, eps)), 0);
    const geoA = Math.exp(logSumA / allSegments.length);
    const geoB = Math.exp(logSumB / allSegments.length);
    const norm = geoA + geoB;
    globalPosteriorA = geoA / norm;
    globalPosteriorB = geoB / norm;
  }

  const globalMargin = Math.abs(globalPosteriorA - globalPosteriorB);
  const globalNeedsAB = globalMargin < AB_THRESHOLD;
  const globalWinner: BayesianABResult["globalWinner"] =
    globalNeedsAB ? "uncertain" : globalPosteriorA > globalPosteriorB ? "A" : "B";

  const confidenceLevel: BayesianABResult["confidenceLevel"] =
    globalMargin >= 0.30 ? "high" :
    globalMargin >= 0.15 ? "moderate" :
    "low";

  // Priority list — segmenty z największą niepewnością, rekomendowane do live A/B
  const priorityAB = allSegments
    .filter((s) => s.needsAB)
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, 8)
    .map((seg) => {
      const dim = dimensions.find((d) => d.segments.includes(seg))!;
      return {
        dimension: dim.dimension,
        dimensionLabel: dim.label,
        label: seg.label,
        entropy: seg.entropy,
        margin: seg.margin,
        winner: seg.winner,
        winnerPosterior: Math.max(seg.posteriorA, seg.posteriorB),
        runnerUpPosterior: Math.min(seg.posteriorA, seg.posteriorB),
        n: seg.n,
      };
    });

  return {
    globalPosteriorA,
    globalPosteriorB,
    globalMargin,
    globalWinner,
    globalNeedsAB,
    confidenceLevel,
    totalPersonas,
    dimensions,
    priorityAB,
  };
}

// ─── Dual-signal Bayes ────────────────────────────────────────────────────────
//
// Łączy dwa niezależne sygnały:
//   Signal 1 (w=0.6): opinie z symulacji (-10..+10) → likelihood ratio
//   Signal 2 (w=0.4): preferencja z rankowania porównawczego → likelihood ratio
//
// Per persona: combined_ratio = w1 * score_ratio + w2 * rank_ratio
//   rank_ratio: A→0.75, B→0.25, tie→0.50
//
// Potem ta sama procedura: posterior per segment → geometric mean → global
//
const W1 = 0.6; // waga Signal 1 (symulacja)
const W2 = 0.4; // waga Signal 2 (ranking porównawczy)

const RANK_PROB: Record<RankPreference, { a: number; b: number }> = {
  A:   { a: 0.75, b: 0.25 },
  B:   { a: 0.25, b: 0.75 },
  tie: { a: 0.50, b: 0.50 },
};

export function computeBayesianDualSignal(
  population: Persona[],
  opinionsA: Record<string, number>,
  opinionsB: Record<string, number>,
  rankingResult: PairRankingResult,
): DualSignalResult {
  // Signal 1 — standardowy Bayes (do porównania)
  const s1 = computeBayesianAB(population, opinionsA, opinionsB);

  // Signal 2 — globalny posterior z rankingów
  const { rankings, countA, countB, countTie, totalRanked } = rankingResult;
  const s2RatioA = totalRanked > 0
    ? (countA * 0.75 + countTie * 0.50 + countB * 0.25) / totalRanked
    : 0.5;
  const s2RatioB = 1 - s2RatioA;
  const s2Winner: "A" | "B" | "uncertain" =
    Math.abs(s2RatioA - s2RatioB) < AB_THRESHOLD ? "uncertain"
    : s2RatioA > s2RatioB ? "A" : "B";

  // Dual-signal per persona — buduj nowe scoresA/scoresB dla każdego segmentu
  const paired = population.filter(
    (p) => opinionsA[p.id] !== undefined && opinionsB[p.id] !== undefined,
  );

  type Bucket = { scoresA: number[]; scoresB: number[]; opinionsA: number[]; opinionsB: number[] };
  const dims: Record<string, Record<string, Bucket>> = {
    gender: {}, ageGroup: {}, income: {}, settlement: {}, political: {},
  };

  for (const p of paired) {
    const opA = opinionsA[p.id];
    const opB = opinionsB[p.id];
    const s1A = opinionToProb(opA);
    const s1B = opinionToProb(opB);

    const rank = rankings[p.id] ?? "tie";
    const { a: r2A, b: r2B } = RANK_PROB[rank];

    // Kombinacja: combined = w1*signal1 + w2*signal2
    const combinedA = W1 * s1A + W2 * r2A;
    const combinedB = W1 * s1B + W2 * r2B;

    const dimKeys: [string, string][] = [
      ["gender",     p.demographic.gender],
      ["ageGroup",   ageGroupKey(p.demographic.age)],
      ["income",     p.financial.incomeLevel],
      ["settlement", p.demographic.settlementType],
      ["political",  p.political.affiliation],
    ];

    for (const [dim, key] of dimKeys) {
      if (!dims[dim][key]) {
        dims[dim][key] = { scoresA: [], scoresB: [], opinionsA: [], opinionsB: [] };
      }
      dims[dim][key].scoresA.push(combinedA);
      dims[dim][key].scoresB.push(combinedB);
      dims[dim][key].opinionsA.push(opA);
      dims[dim][key].opinionsB.push(opB);
    }
  }

  const dimensions: DimensionResult[] = Object.entries(dims).map(([dim, segments]) => ({
    dimension: dim,
    label: DIMENSION_LABELS[dim] ?? dim,
    segments: Object.entries(segments).map(([key, b]) =>
      computeSegmentPosterior(
        SEGMENT_LABELS[dim]?.[key] ?? key,
        key, b.scoresA, b.scoresB, b.opinionsA, b.opinionsB,
      )
    ).sort((a, b) => b.posteriorA - a.posteriorA),
  }));

  const allSegments = dimensions.flatMap((d) => d.segments).filter((s) => s.n >= MIN_SEGMENT_N);

  let globalPosteriorA: number;
  let globalPosteriorB: number;

  if (allSegments.length === 0) {
    globalPosteriorA = 0.5;
    globalPosteriorB = 0.5;
  } else {
    const eps = 1e-6;
    const logSumA = allSegments.reduce((s, seg) => s + Math.log(Math.max(seg.posteriorA, eps)), 0);
    const logSumB = allSegments.reduce((s, seg) => s + Math.log(Math.max(seg.posteriorB, eps)), 0);
    const geoA = Math.exp(logSumA / allSegments.length);
    const geoB = Math.exp(logSumB / allSegments.length);
    const norm = geoA + geoB;
    globalPosteriorA = geoA / norm;
    globalPosteriorB = geoB / norm;
  }

  const globalMargin = Math.abs(globalPosteriorA - globalPosteriorB);
  const globalNeedsAB = globalMargin < AB_THRESHOLD;
  const globalWinner: BayesianABResult["globalWinner"] =
    globalNeedsAB ? "uncertain" : globalPosteriorA > globalPosteriorB ? "A" : "B";
  const confidenceLevel: BayesianABResult["confidenceLevel"] =
    globalMargin >= 0.30 ? "high" : globalMargin >= 0.15 ? "moderate" : "low";

  const priorityAB = allSegments
    .filter((s) => s.needsAB)
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, 8)
    .map((seg) => {
      const dim = dimensions.find((d) => d.segments.includes(seg))!;
      return {
        dimension: dim.dimension,
        dimensionLabel: dim.label,
        label: seg.label,
        entropy: seg.entropy,
        margin: seg.margin,
        winner: seg.winner,
        winnerPosterior: Math.max(seg.posteriorA, seg.posteriorB),
        runnerUpPosterior: Math.min(seg.posteriorA, seg.posteriorB),
        n: seg.n,
      };
    });

  // Zgodność sygnałów
  const s1Winner = s1.globalWinner;
  const signalAgreement: DualSignalResult["signalAgreement"] =
    s1Winner === "uncertain" || s2Winner === "uncertain" ? "weak"
    : s1Winner === s2Winner ? "agree"
    : "disagree";

  return {
    globalPosteriorA,
    globalPosteriorB,
    globalMargin,
    globalWinner,
    globalNeedsAB,
    confidenceLevel,
    totalPersonas: paired.length,
    dimensions,
    priorityAB,
    signal1: {
      globalPosteriorA: s1.globalPosteriorA,
      globalPosteriorB: s1.globalPosteriorB,
      globalWinner: s1.globalWinner,
      globalMargin: s1.globalMargin,
    },
    signal2: {
      globalPosteriorA: s2RatioA,
      globalPosteriorB: s2RatioB,
      globalWinner: s2Winner,
      globalMargin: Math.abs(s2RatioA - s2RatioB),
      countA,
      countB,
      countTie,
      totalRanked,
    },
    signalAgreement,
    weights: { signal1: W1, signal2: W2 },
  };
}
