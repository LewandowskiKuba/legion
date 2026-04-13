// ─────────────────────────────────────────────────────────────────────────────
// Kalibracja populacji z GUS Bank Danych Lokalnych (BDL API)
// Dokumentacja: https://bdl.stat.gov.pl/api/v1/
//
// Uruchomienie: tsx scripts/calibrate-from-bdl.ts
// Generuje:     data/calibration/bdl_snapshot.json
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API = "https://bdl.stat.gov.pl/api/v1";
const HEADERS = { Accept: "application/json" };

async function get(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`BDL ${path} → ${res.status}`);
  return res.json();
}

async function fetchLatest(varId: number, unitLevel = 0): Promise<number | null> {
  const data = await get(`/data/by-variable/${varId}?unit-level=${unitLevel}&lang=pl&page=0&pageSize=1`);
  const vals = data.results?.[0]?.values;
  if (!vals?.length) return null;
  return vals.at(-1)?.val ?? null;
}

async function fetchTimeSeries(varId: number, unitLevel = 0): Promise<{ year: number; val: number }[]> {
  const data = await get(`/data/by-variable/${varId}?unit-level=${unitLevel}&lang=pl&page=0&pageSize=1`);
  const result = data.results?.[0];
  if (!result) return [];
  return (result.values as any[])
    .filter((v: any) => v.val !== null)
    .map((v: any) => ({ year: Number(v.year), val: Number(v.val) }))
    .sort((a: any, b: any) => a.year - b.year);
}

async function fetchRegional(varId: number): Promise<{ id: string; name?: string; val: number }[]> {
  const [p0, p1] = await Promise.all([
    get(`/data/by-variable/${varId}?unit-level=2&lang=pl&page=0&pageSize=10`),
    get(`/data/by-variable/${varId}?unit-level=2&lang=pl&page=1&pageSize=10`),
  ]);
  return [...(p0.results ?? []), ...(p1.results ?? [])]
    .map((r: any) => ({ id: r.id, name: r.name, val: r.values?.at(-1)?.val ?? null }))
    .filter((r: any) => r.val !== null);
}

// ─── Zmienne BDL (GUS BDL API, zweryfikowane 2025-03) ────────────────────────

const VARS = {
  // Wiek – populacja ogółem, GUS 2024
  age_15_19:  72309,
  age_20_24:  47734,
  age_25_29:  47694,
  age_30_34:  47722,
  age_35_39:  47701,
  age_40_44:  47707,
  age_45_49:  47726,
  age_50_54:  47717,
  age_55_59:  47732,
  age_60_64:  47739,
  age_65_69:  72239,
  age_70_74:  76022,
  age_75_79:  76023,
  age_80_84:  76024,

  // Płeć (GUS – te zmienne mają niespójne pokrycie; używamy stałego 48/52)
  gender_male:   7,
  gender_female: 8,

  // Wykształcenie – NSP 2021 (jednorazowe – rok zawsze 2021)
  edu_higher:          1671257,   // wyższe
  edu_secondary_poly:  1671258,   // średnie + policealne
  edu_vocational:      1671261,   // zasadnicze zawodowe / branżowe
  edu_primary:         1671263,   // podstawowe i niższe

  // Zamieszkanie – rozkład miasto/wieś, GUS roczne
  settlement_urban: 60617,
  settlement_rural: 60633,

  // Populacja wg województw – podstawa wag regionalnych (P2137 ogółem)
  pop_by_voiv: 72305,

  // Dochody gosp. domowych
  income_disposable_per_capita: 216973,
  income_from_employment:       216969,
  income_from_selfemployment:   216971,
  income_from_social_benefits:  216972,

  // Gosp. domowe – NSP 2021
  hh_single:          1641714,
  hh_couple_no_kids:  1641718,
  hh_couple_kids:     1641719,
  hh_single_mom:      1641723,
  hh_single_dad:      1641724,
};

// TERYT → klucz w distributions.ts
const VOIV_MAP: Record<string, string> = {
  "011200000000": "malopolskie",
  "012400000000": "slaskie",
  "020800000000": "lubuskie",
  "023000000000": "wielkopolskie",
  "023200000000": "zachodniopomorskie",
  "030200000000": "dolnoslaskie",
  "031600000000": "opolskie",
  "040400000000": "kujawsko-pomorskie",
  "042200000000": "pomorskie",
  "042800000000": "warminsko-mazurskie",
  "051000000000": "lodzkie",
  "052600000000": "swietokrzyskie",
  "060600000000": "lubelskie",
  "061800000000": "podkarpackie",
  "062000000000": "podlaskie",
  "071400000000": "mazowieckie",
};

function pct(val: number, total: number): number {
  return Math.round((val / total) * 1000) / 10;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("◆ Pobieranie danych z GUS BDL API...\n");

  // 1. Wiek
  console.log("  → Grupy wiekowe (GUS 2024)...");
  const ageVarIds = [
    VARS.age_15_19, VARS.age_20_24, VARS.age_25_29, VARS.age_30_34,
    VARS.age_35_39, VARS.age_40_44, VARS.age_45_49, VARS.age_50_54,
    VARS.age_55_59, VARS.age_60_64, VARS.age_65_69, VARS.age_70_74,
    VARS.age_75_79, VARS.age_80_84,
  ];
  const ageVals = await Promise.all(ageVarIds.map(v => fetchLatest(v)));
  const [a15_19, a20_24, a25_29, a30_34, a35_39, a40_44, a45_49, a50_54, a55_59, a60_64, a65_69, a70_74, a75_79, a80_84] =
    ageVals.map(v => v ?? 0);

  // Szacunek 18-19: 2/5 grupy 15-19
  const a18_19 = Math.round(a15_19 * 2 / 5);
  // Szacunek 75-80: 75-79 + 1/5 grupy 80-84
  const a75_80 = a75_79 + Math.round(a80_84 / 5);

  const ageBrackets: [string, number][] = [
    ["18-24",  a18_19 + a20_24],
    ["25-34",  a25_29 + a30_34],
    ["35-44",  a35_39 + a40_44],
    ["45-54",  a45_49 + a50_54],
    ["55-64",  a55_59 + a60_64],
    ["65-74",  a65_69 + a70_74],
    ["75-80",  a75_80],
  ];
  const ageTotal = ageBrackets.reduce((s, [, v]) => s + v, 0);
  const agePct = ageBrackets.map(([k, v]) => [k, pct(v, ageTotal)] as [string, number]);
  agePct.forEach(([k, p]) => console.log(`     ${k}: ${p}%`));

  // 2. Wykształcenie (NSP 2021)
  console.log("  → Wykształcenie (NSP 2021)...");
  const [eduHigher, eduSecPoly, eduVoc, eduPrim] = await Promise.all([
    fetchLatest(VARS.edu_higher),
    fetchLatest(VARS.edu_secondary_poly),
    fetchLatest(VARS.edu_vocational),
    fetchLatest(VARS.edu_primary),
  ]);
  const eduTotal = (eduHigher ?? 0) + (eduSecPoly ?? 0) + (eduVoc ?? 0) + (eduPrim ?? 0);
  const eduPct = {
    higher:    pct(eduHigher ?? 0, eduTotal),
    secondary: pct(eduSecPoly ?? 0, eduTotal),
    vocational:pct(eduVoc ?? 0, eduTotal),
    primary:   pct(eduPrim ?? 0, eduTotal),
  };
  console.log(`     higher: ${eduPct.higher}%, secondary: ${eduPct.secondary}%, vocational: ${eduPct.vocational}%, primary: ${eduPct.primary}%`);

  // 3. Osiedlenie (2024)
  console.log("  → Miasto / wieś (GUS 2024)...");
  const [settUrban, settRural] = await Promise.all([
    fetchLatest(VARS.settlement_urban),
    fetchLatest(VARS.settlement_rural),
  ]);
  const settTotal = (settUrban ?? 0) + (settRural ?? 0);
  const settPct = { urban: pct(settUrban ?? 0, settTotal), rural: pct(settRural ?? 0, settTotal) };
  console.log(`     urban: ${settPct.urban}%, rural: ${settPct.rural}%`);

  // 4. Wagi regionalne
  console.log("  → Wagi regionalne (województwa 2024)...");
  const regional = await fetchRegional(VARS.pop_by_voiv);
  const regTotal = regional.reduce((s, r) => s + r.val, 0);
  const regionWeights: Record<string, number> = {};
  for (const r of regional) {
    const name = VOIV_MAP[r.id] ?? r.id;
    regionWeights[name] = pct(r.val, regTotal);
  }

  // 5. Dochody
  console.log("  → Dochody gosp. domowych...");
  const incomeTs = await fetchTimeSeries(VARS.income_disposable_per_capita);
  const latestIncome = incomeTs.at(-1);
  const prevYearIncome = incomeTs.at(-2);
  const growthFactor = (latestIncome?.val ?? 1) / (prevYearIncome?.val ?? 1);

  // 6. Gosp. domowe (NSP 2021)
  console.log("  → Typy gosp. domowych (NSP 2021)...");
  const [hhSingle, hhCoupleNoKids, hhCoupleKids, hhMom, hhDad] = await Promise.all([
    fetchLatest(VARS.hh_single),
    fetchLatest(VARS.hh_couple_no_kids),
    fetchLatest(VARS.hh_couple_kids),
    fetchLatest(VARS.hh_single_mom),
    fetchLatest(VARS.hh_single_dad),
  ]);
  const hhTotal = (hhSingle ?? 0) + (hhCoupleNoKids ?? 0) + (hhCoupleKids ?? 0) + (hhMom ?? 0) + (hhDad ?? 0);
  const hhPct = {
    single:          pct(hhSingle ?? 0, hhTotal),
    couple_no_kids:  pct(hhCoupleNoKids ?? 0, hhTotal),
    couple_with_kids:pct(hhCoupleKids ?? 0, hhTotal),
    single_parent:   pct((hhMom ?? 0) + (hhDad ?? 0), hhTotal),
  };

  // ─── Suggested income brackets ───────────────────────────────────────────
  const BRACKETS_2023 = { below_2000: 2000, lower: 3500, middle: 5000, upper: 8000 };
  const suggestedBrackets = {
    below: Math.round(BRACKETS_2023.below_2000 * growthFactor / 100) * 100,
    lower: Math.round(BRACKETS_2023.lower * growthFactor / 100) * 100,
    middle: Math.round(BRACKETS_2023.middle * growthFactor / 100) * 100,
    upper: Math.round(BRACKETS_2023.upper * growthFactor / 100) * 100,
  };

  // ─── Output snapshot ─────────────────────────────────────────────────────
  const snapshot = {
    _meta: {
      source: "GUS Bank Danych Lokalnych (BDL API)",
      url: "https://bdl.stat.gov.pl/api/v1/",
      generated: new Date().toISOString(),
      data_year_demographic: 2024,
      data_year_education: 2021,
      data_year_households: 2021,
    },

    age_18_80: {
      _note: "Populacja 18-80 lat, GUS 2024. Źródło: grupy 5-letnie z BDL subj P2137.",
      brackets_pct: Object.fromEntries(agePct),
      brackets_abs: Object.fromEntries(ageBrackets),
      suggested_distributions_ts_weights: Object.fromEntries(
        agePct.map(([k, p]) => [k, Math.round(p)])
      ),
    },

    education: {
      _note: "NSP 2021 – cała populacja dorosłych (nie tylko aktywni zawodowo jak w BAEL)",
      pct: eduPct,
      abs: { higher: eduHigher, secondary_poly: eduSecPoly, vocational: eduVoc, primary: eduPrim },
      suggested_distributions_ts_weights: {
        higher: Math.round(eduPct.higher),
        secondary: Math.round(eduPct.secondary),
        vocational: Math.round(eduPct.vocational),
        primary: Math.round(eduPct.primary),
      },
    },

    settlement: {
      _note: "GUS 2024 – miasto/wieś podział",
      pct: settPct,
      abs: { urban: settUrban, rural: settRural },
      note_subcategories: "Podkategorie miejskie (small_city/medium_city/large_city/metropolis) w distributions.ts są szacunkowe – BDL nie rozbija według rozmiaru miasta",
    },

    region_weights_pct: regionWeights,

    income: {
      disposable_per_capita_pln: {
        latest_year: latestIncome?.year,
        latest_value: latestIncome?.val,
        timeseries: incomeTs.slice(-5),
        yoy_growth_pct: Math.round((growthFactor - 1) * 1000) / 10,
      },
      suggested_income_brackets: {
        note: `Progi przeskalowane wg wzrostu dochodu rozporządzalnego (×${growthFactor.toFixed(3)})`,
        below: suggestedBrackets.below,
        lower: suggestedBrackets.lower,
        middle: suggestedBrackets.middle,
        upper: suggestedBrackets.upper,
      },
    },

    households: {
      _note: "NSP 2021 – typy gosp. domowych. Wartości to % liczby gosp., nie osób.",
      pct: hhPct,
      abs: { single: hhSingle, couple_no_kids: hhCoupleNoKids, couple_with_kids: hhCoupleKids, single_mom: hhMom, single_dad: hhDad },
    },
  };

  const outDir = join(process.cwd(), "data", "calibration");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "bdl_snapshot.json");
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(`\n✓ Snapshot zapisany → ${outPath}`);
  console.log("\n── Kluczowe dane dla distributions.ts ─────────────────────────");

  console.log("\n  sampleAge() – nowe wagi (GUS 2024, populacja 18-80):");
  agePct.forEach(([k, p]) => console.log(`    [${k}]: ${Math.round(p)}`));

  console.log("\n  sampleEducation() – nowe wagi (NSP 2021, cała populacja):");
  console.log(`    primary:    ${Math.round(eduPct.primary)}`);
  console.log(`    vocational: ${Math.round(eduPct.vocational)}`);
  console.log(`    secondary:  ${Math.round(eduPct.secondary)}`);
  console.log(`    higher:     ${Math.round(eduPct.higher)}`);
  console.log(`    ⚠ UWAGA: NSP 2021 vs BAEL: higher 27% (NSP) vs 42% (BAEL workforce)`);

  console.log("\n  sampleRegion() – nowe wagi (GUS 2024):");
  Object.entries(regionWeights)
    .sort(([,a],[,b]) => b - a)
    .forEach(([name, p]) => console.log(`    ${name}: ${p}%`));

  console.log("\n  settlement – city/rural: urban", settPct.urban + "%, rural", settPct.rural + "%");
  console.log(`    (current village:40% ≈ BDL rural:${settPct.rural}% ✓)`);

  console.log(`\n  income brackets (przeskalowane do ${latestIncome?.year}):`);
  console.log(`    below < ${suggestedBrackets.below} PLN`);
  console.log(`    lower < ${suggestedBrackets.lower} PLN`);
  console.log(`    middle < ${suggestedBrackets.middle} PLN`);
  console.log(`    upper < ${suggestedBrackets.upper} PLN`);
}

main().catch(console.error);
