import type { Persona } from "../personas/schema.js";

export interface SegmentOpinionStats {
  segment: string;
  label: string;
  count: number;
  avgOpinion: number;
  positiveRatio: number; // 0–1
  negativeRatio: number; // 0–1
  neutralRatio: number;  // 0–1
}

export interface PsychoDimension {
  dimension: string;
  segments: SegmentOpinionStats[];
}

export interface DemographicBreakdown {
  byAgeGroup: SegmentOpinionStats[];
  byGender: SegmentOpinionStats[];
  byEducation: SegmentOpinionStats[];
  byPolitical: SegmentOpinionStats[];
  bySettlement: SegmentOpinionStats[];
  psychographic: {
    personality: PsychoDimension[];
    values: PsychoDimension[];
    trust: PsychoDimension[];
  };
}

// ── Demographic helpers ───────────────────────────────────────────────────────

function ageGroup(age: number): string {
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 60) return "45-59";
  return "60+";
}

const AGE_LABELS: Record<string, string> = {
  "18-29": "18–29 lat",
  "30-44": "30–44 lat",
  "45-59": "45–59 lat",
  "60+":   "60+ lat",
};

const GENDER_LABELS: Record<string, string> = {
  male:   "Mężczyźni",
  female: "Kobiety",
};

const EDUCATION_LABELS: Record<string, string> = {
  primary:    "Podstawowe",
  vocational: "Zawodowe",
  secondary:  "Średnie",
  higher:     "Wyższe",
};

const POLITICAL_LABELS: Record<string, string> = {
  pis:          "PiS",
  ko:           "KO",
  td:           "TD",
  lewica:       "Lewica",
  konfederacja: "Konfederacja",
  undecided:    "Niezdecydowani",
  apolitical:   "Apolityczni",
};

const SETTLEMENT_LABELS: Record<string, string> = {
  village:      "Wieś",
  small_city:   "Małe miasto",
  medium_city:  "Średnie miasto",
  large_city:   "Duże miasto",
  metropolis:   "Metropolia",
};

// ── Psychographic helpers ─────────────────────────────────────────────────────

const LEVEL_ORDER = ["low", "medium", "high"];
const LEVEL_LABELS: Record<string, string> = {
  low:    "Niski",
  medium: "Średni",
  high:   "Wysoki",
};

function levelBucket(value: number): string {
  if (value <= 33) return "low";
  if (value <= 66) return "medium";
  return "high";
}

function buildPsychoDimension(
  dimension: string,
  values: Map<string, number[]>,
): PsychoDimension {
  return {
    dimension,
    segments: buildStats(values, LEVEL_LABELS, LEVEL_ORDER),
  };
}

// ── Generic stats builder ─────────────────────────────────────────────────────

function buildStats(
  groups: Map<string, number[]>,
  labelMap: Record<string, string>,
  order?: string[],
): SegmentOpinionStats[] {
  const entries = order
    ? order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!] as [string, number[]])
    : [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return entries.map(([segment, opinions]) => {
    const count = opinions.length;
    const avg = opinions.reduce((s, v) => s + v, 0) / count;
    const pos = opinions.filter((v) => v > 0).length;
    const neg = opinions.filter((v) => v < 0).length;
    const neu = opinions.filter((v) => v === 0).length;
    return {
      segment,
      label: labelMap[segment] ?? segment,
      count,
      avgOpinion: Math.round(avg * 100) / 100,
      positiveRatio: pos / count,
      negativeRatio: neg / count,
      neutralRatio: neu / count,
    };
  });
}

function makeTracker() {
  const m = new Map<string, number[]>();
  return {
    push(key: string, val: number) {
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(val);
    },
    map: m,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeDemographicBreakdown(
  population: Persona[],
  agentOpinions: Record<string, number>,
): DemographicBreakdown {
  // Demographic
  const age      = makeTracker();
  const gender   = makeTracker();
  const edu      = makeTracker();
  const political = makeTracker();
  const settle   = makeTracker();

  // OCEAN
  const openness          = makeTracker();
  const conscientiousness = makeTracker();
  const extraversion      = makeTracker();
  const agreeableness     = makeTracker();
  const neuroticism       = makeTracker();

  // Values
  const traditionalism = makeTracker();
  const collectivism   = makeTracker();
  const riskTolerance  = makeTracker();

  // Trust
  const institutionalTrust = makeTracker();
  const mediaTrust         = makeTracker();
  const brandTrust         = makeTracker();

  for (const persona of population) {
    const opinion = agentOpinions[persona.id];
    if (opinion === undefined) continue;

    const d   = persona.demographic;
    const p   = persona.political;
    const psy = persona.psychographic;

    // Demographic
    age.push(ageGroup(d.age), opinion);
    gender.push(d.gender, opinion);
    edu.push(d.education, opinion);
    political.push(p.affiliation, opinion);
    settle.push(d.settlementType, opinion);

    // OCEAN
    openness.push(levelBucket(psy.ocean.openness), opinion);
    conscientiousness.push(levelBucket(psy.ocean.conscientiousness), opinion);
    extraversion.push(levelBucket(psy.ocean.extraversion), opinion);
    agreeableness.push(levelBucket(psy.ocean.agreeableness), opinion);
    neuroticism.push(levelBucket(psy.ocean.neuroticism), opinion);

    // Values
    traditionalism.push(levelBucket(psy.traditionalism), opinion);
    collectivism.push(levelBucket(psy.collectivism), opinion);
    riskTolerance.push(levelBucket(psy.riskTolerance), opinion);

    // Trust
    institutionalTrust.push(levelBucket(psy.institutionalTrust), opinion);
    mediaTrust.push(levelBucket(psy.mediaTrust), opinion);
    brandTrust.push(levelBucket(psy.brandTrust), opinion);
  }

  return {
    byAgeGroup:   buildStats(age.map,     AGE_LABELS,       ["18-29", "30-44", "45-59", "60+"]),
    byGender:     buildStats(gender.map,  GENDER_LABELS,    ["male", "female"]),
    byEducation:  buildStats(edu.map,     EDUCATION_LABELS, ["primary", "vocational", "secondary", "higher"]),
    byPolitical:  buildStats(political.map, POLITICAL_LABELS, ["pis", "ko", "td", "lewica", "konfederacja", "undecided", "apolitical"]),
    bySettlement: buildStats(settle.map,  SETTLEMENT_LABELS, ["village", "small_city", "medium_city", "large_city", "metropolis"]),
    psychographic: {
      personality: [
        buildPsychoDimension("Otwartość",    openness.map),
        buildPsychoDimension("Sumienność",   conscientiousness.map),
        buildPsychoDimension("Ekstrawersja", extraversion.map),
        buildPsychoDimension("Ugodowość",    agreeableness.map),
        buildPsychoDimension("Neurotyczność", neuroticism.map),
      ],
      values: [
        buildPsychoDimension("Tradycjonalizm",     traditionalism.map),
        buildPsychoDimension("Kolektywizm",        collectivism.map),
        buildPsychoDimension("Tolerancja ryzyka",  riskTolerance.map),
      ],
      trust: [
        buildPsychoDimension("Zaufanie instytucjonalne", institutionalTrust.map),
        buildPsychoDimension("Zaufanie mediom",          mediaTrust.map),
        buildPsychoDimension("Zaufanie markom",          brandTrust.map),
      ],
    },
  };
}
