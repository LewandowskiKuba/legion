// ─────────────────────────────────────────────────────────────────────────────
// Calibration loader — reads data/calibration/bdl_snapshot.json at startup
// and exports typed weights used by distributions.ts.
// Fallback to hardcoded 2024 values if snapshot missing or malformed.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SNAPSHOT_PATH = join(process.cwd(), "data", "calibration", "bdl_snapshot.json");

// ─── Age bracket weights ───────────────────────────────────────────────────

export interface AgeBracketWeights {
  "18-24": number;
  "25-34": number;
  "35-44": number;
  "45-54": number;
  "55-64": number;
  "65-74": number;
  "75-80": number;
}

const AGE_FALLBACK: AgeBracketWeights = {
  "18-24":  9, "25-34": 15, "35-44": 21,
  "45-54": 19, "55-64": 15, "65-74": 16, "75-80": 6,
};

// ─── Education weights ─────────────────────────────────────────────────────

export interface EducationWeights {
  primary: number;
  vocational: number;
  secondary: number;
  higher: number;
}

const EDUCATION_FALLBACK: EducationWeights = {
  primary: 13, vocational: 23, secondary: 37, higher: 27,
};

// ─── Region weights ────────────────────────────────────────────────────────

export type RegionWeights = Record<string, number>;

const REGION_FALLBACK: RegionWeights = {
  mazowieckie: 15, slaskie: 11, wielkopolskie: 9, malopolskie: 9,
  dolnoslaskie: 8, lodzkie: 6, pomorskie: 6, "kujawsko-pomorskie": 5,
  lubelskie: 5, podkarpackie: 5, zachodniopomorskie: 4,
  "warminsko-mazurskie": 4, swietokrzyskie: 3, podlaskie: 3,
  opolskie: 3, lubuskie: 2,
};

// ─── Income bracket thresholds (PLN netto/mc) ─────────────────────────────

export interface IncomeBracketThresholds {
  below: number;  // upper bound of lowest bracket
  lower: number;  // upper bound of 2nd bracket
  middle: number; // upper bound of 3rd bracket
  upper: number;  // upper bound of 4th bracket
  // above upper = highest bracket
}

const INCOME_THRESHOLDS_FALLBACK: IncomeBracketThresholds = {
  below: 2400, lower: 4100, middle: 5900, upper: 9500,
};

// ─── Loader ────────────────────────────────────────────────────────────────

interface CalibrationData {
  ageWeights: AgeBracketWeights;
  educationWeights: EducationWeights;
  regionWeights: RegionWeights;
  incomeThresholds: IncomeBracketThresholds;
  snapshotDate: string | null;
}

function loadCalibration(): CalibrationData {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.warn("[calibration] bdl_snapshot.json not found — using fallback weights");
    return {
      ageWeights: AGE_FALLBACK,
      educationWeights: EDUCATION_FALLBACK,
      regionWeights: REGION_FALLBACK,
      incomeThresholds: INCOME_THRESHOLDS_FALLBACK,
      snapshotDate: null,
    };
  }

  try {
    const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));

    const ageWeights: AgeBracketWeights = {
      ...AGE_FALLBACK,
      ...(raw.age_18_80?.suggested_distributions_ts_weights ?? {}),
    };

    const edu = raw.education?.suggested_distributions_ts_weights ?? {};
    const educationWeights: EducationWeights = {
      primary:    edu.primary    ?? EDUCATION_FALLBACK.primary,
      vocational: edu.vocational ?? EDUCATION_FALLBACK.vocational,
      secondary:  edu.secondary  ?? EDUCATION_FALLBACK.secondary,
      higher:     edu.higher     ?? EDUCATION_FALLBACK.higher,
    };

    const regionPct: Record<string, number> = raw.region_weights_pct ?? {};
    const regionWeights: RegionWeights = Object.keys(REGION_FALLBACK).reduce((acc, key) => {
      acc[key] = regionPct[key] != null ? Math.round(regionPct[key]) : REGION_FALLBACK[key];
      return acc;
    }, {} as RegionWeights);

    const inc = raw.income?.suggested_income_brackets ?? {};
    const incomeThresholds: IncomeBracketThresholds = {
      below:  inc.below  ?? INCOME_THRESHOLDS_FALLBACK.below,
      lower:  inc.lower  ?? INCOME_THRESHOLDS_FALLBACK.lower,
      middle: inc.middle ?? INCOME_THRESHOLDS_FALLBACK.middle,
      upper:  inc.upper  ?? INCOME_THRESHOLDS_FALLBACK.upper,
    };

    const snapshotDate: string = raw._meta?.generated ?? "unknown";
    console.log(`[calibration] Loaded BDL snapshot (${snapshotDate})`);

    return { ageWeights, educationWeights, regionWeights, incomeThresholds, snapshotDate };
  } catch (err) {
    console.warn("[calibration] Failed to parse bdl_snapshot.json:", (err as Error).message);
    return {
      ageWeights: AGE_FALLBACK,
      educationWeights: EDUCATION_FALLBACK,
      regionWeights: REGION_FALLBACK,
      incomeThresholds: INCOME_THRESHOLDS_FALLBACK,
      snapshotDate: null,
    };
  }
}

export const calibration = loadCalibration();
