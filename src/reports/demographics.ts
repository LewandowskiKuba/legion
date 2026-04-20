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

export interface DemographicBreakdown {
  byAgeGroup: SegmentOpinionStats[];
  byGender: SegmentOpinionStats[];
  byEducation: SegmentOpinionStats[];
  byPolitical: SegmentOpinionStats[];
  bySettlement: SegmentOpinionStats[];
}

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

export function computeDemographicBreakdown(
  population: Persona[],
  agentOpinions: Record<string, number>,
): DemographicBreakdown {
  const age      = new Map<string, number[]>();
  const gender   = new Map<string, number[]>();
  const edu      = new Map<string, number[]>();
  const political = new Map<string, number[]>();
  const settle   = new Map<string, number[]>();

  for (const persona of population) {
    const opinion = agentOpinions[persona.id];
    if (opinion === undefined) continue;

    const d = persona.demographic;
    const p = persona.political;

    const ag = ageGroup(d.age);
    if (!age.has(ag)) age.set(ag, []);
    age.get(ag)!.push(opinion);

    if (!gender.has(d.gender)) gender.set(d.gender, []);
    gender.get(d.gender)!.push(opinion);

    if (!edu.has(d.education)) edu.set(d.education, []);
    edu.get(d.education)!.push(opinion);

    const aff = p.affiliation;
    if (!political.has(aff)) political.set(aff, []);
    political.get(aff)!.push(opinion);

    const st = d.settlementType;
    if (!settle.has(st)) settle.set(st, []);
    settle.get(st)!.push(opinion);
  }

  return {
    byAgeGroup:  buildStats(age,      AGE_LABELS,       ["18-29", "30-44", "45-59", "60+"]),
    byGender:    buildStats(gender,   GENDER_LABELS,    ["male", "female"]),
    byEducation: buildStats(edu,      EDUCATION_LABELS, ["primary", "vocational", "secondary", "higher"]),
    byPolitical: buildStats(political, POLITICAL_LABELS, ["pis", "ko", "td", "lewica", "konfederacja", "undecided", "apolitical"]),
    bySettlement: buildStats(settle,  SETTLEMENT_LABELS, ["village", "small_city", "medium_city", "large_city", "metropolis"]),
  };
}
