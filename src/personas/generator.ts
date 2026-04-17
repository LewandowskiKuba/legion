// ─────────────────────────────────────────────────────────────────────────────
// Generator populacji syntetycznej
// Tworzy N person z rozkładami zgodnymi z polską strukturą demograficzną
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { Persona } from "./schema.js";
import {
  weightedRandom,
  normalInt,
  fisherYates,
  sampleAge,
  sampleGender,
  sampleEducationForAge,
  sampleSettlementType,
  sampleRegion,
  sampleHousehold,
  sampleIncomeLevel,
  sampleOwnsProperty,
  samplePoliticalAffiliation,
  sampleMediaHabits,
  sampleCommunicationStyles,
  sampleProductCategories,
  sampleName,
} from "./distributions.js";
import { assignBrandMemory } from "./brandMemory.js";
import { calibration } from "./calibration.js";

// ─── Macierze korelacji warunkowych ──────────────────────────────────────────

// Traditionalism: wiek (silny wpływ) + afilicja polityczna
const TRAD_AGE = (age: number) => age > 65 ? 20 : age > 55 ? 12 : age < 30 ? -15 : age < 40 ? -5 : 0;
const TRAD_AFFILIATION: Record<string, number> = {
  pis: 18, td: 5, ko: -8, lewica: -18, konfederacja: 12, undecided: 0, apolitical: -2,
};

// Zaufanie instytucjonalne: afilicja polityczna (CBOS 2024 – odsetek ufających instytucjom)
const TRUST_AFFILIATION: Record<string, number> = {
  pis: -12, ko: 12, td: 6, lewica: 5, konfederacja: -22, undecided: -2, apolitical: -5,
};

// Zaufanie do mediów: afilicja polityczna
const MEDIA_TRUST_AFFILIATION: Record<string, number> = {
  pis: -12, ko: 8, td: 5, lewica: 5, konfederacja: -22, undecided: -3, apolitical: -5,
};

// Kolektywizm: typ gospodarstwa domowego
const COLLECTIVISM_HOUSEHOLD: Record<string, number> = {
  multigenerational: 15, family_young_kids: 8, family_teen_kids: 5,
  family_adult_kids: 5, single_parent: 3, couple_no_kids: 0, single: -12,
};

// Otwartość OCEAN: wykształcenie (silny) + wiek
const OPENNESS_EDU: Record<string, number> = { primary: -18, vocational: -8, secondary: 0, higher: 18 };
const OPENNESS_AGE = (age: number) => age > 65 ? -12 : age > 50 ? -5 : age < 30 ? 8 : 0;

// Sumienność OCEAN: wiek (doświadczenie zawodowe)
const CONSCIENTIOUSNESS_AGE = (age: number) => age > 55 ? 10 : age < 25 ? -8 : 0;

// Płeć → OCEAN: meta-analizy (Costa et al. 2001, Schmitt et al. 2008)
// Kobiety: wyższa ugodowość (d≈0.5, +7 pkt) i neurotyczność (d≈0.4, +5 pkt)
// Mężczyźni: wyższy apetyt na ryzyko (d≈0.5, +8 pkt riskTolerance)
const GENDER_OCEAN = {
  female: { agreeableness: +7, neuroticism: +5, riskTolerance: -8 },
  male:   { agreeableness:  0, neuroticism:  0, riskTolerance: +8 },
};

// Postawy polityczne warunkowane na afilicję i wykształcenie
const EU_EDU: Record<string, number> = { primary: -12, vocational: -6, secondary: 0, higher: 15 };
const EU_SETTLEMENT: Record<string, number> = {
  village: -10, small_city: -5, medium_city: 0, large_city: 10, metropolis: 15,
};

const CLIMATE_EDU: Record<string, number> = { primary: -12, vocational: -6, secondary: 0, higher: 15 };
const CLIMATE_AGE = (age: number) => age < 30 ? 12 : age < 45 ? 5 : 0;

const MIGRATION_AFFILIATION: Record<string, number> = {
  pis: -15, td: -5, ko: 8, lewica: 18, konfederacja: -22, undecided: 0, apolitical: 0,
};

// ─── Generowanie pojedynczej persony ─────────────────────────────────────────

function generatePersona(): Persona {
  const gender = sampleGender();
  const age = sampleAge();
  const education = sampleEducationForAge(age);  // structural zero: age < 22 → brak wyższego
  const settlementType = sampleSettlementType();
  const region = sampleRegion();
  const householdType = sampleHousehold(age, gender);
  const incomeLevel = sampleIncomeLevel(education, settlementType, age, gender);
  const affiliation = samplePoliticalAffiliation(age, settlementType);

  // Korelacje warunkowe
  const traditionalism = normalInt(
    50 + TRAD_AGE(age) + (TRAD_AFFILIATION[affiliation] ?? 0), 17, 0, 100
  );
  const institutionalTrust = normalInt(45 + (TRUST_AFFILIATION[affiliation] ?? 0), 17, 0, 100);
  const mediaTrust = normalInt(40 + (MEDIA_TRUST_AFFILIATION[affiliation] ?? 0), 17, 0, 100);
  const collectivism = normalInt(50 + (COLLECTIVISM_HOUSEHOLD[householdType] ?? 0), 16, 0, 100);

  const euAttitude = normalInt(
    50 + (EU_EDU[education] ?? 0) + (EU_SETTLEMENT[settlementType] ?? 0), 18, 0, 100
  );
  const climateAwareness = normalInt(
    50 + CLIMATE_AGE(age) + (CLIMATE_EDU[education] ?? 0), 18, 0, 100
  );
  const migrationAttitude = normalInt(50 + (MIGRATION_AFFILIATION[affiliation] ?? 0), 18, 0, 100);

  // Korekty OCEAN wg płci (Costa et al. 2001, Schmitt et al. 2008)
  const genderMod = GENDER_OCEAN[gender];

  // Dług: korelacja z dochodem (nie tylko wiekiem) — GUS Finanse gosp. domowych 2023
  // Logika: wysokie dochody → łatwiejszy dostęp do kredytu, ale też szybsza spłata
  // Niskie dochody → kredyty konsumpcyjne na życie bieżące (wyższe wskaźniki zadłużenia relatywnie)
  const debtBaseByIncome: Record<string, number> = {
    below_2000: 0.60,   // pożyczki gotówkowe, chwilówki
    "2000_3500": 0.52,  // kredyt konsumpcyjny powszechny
    "3500_5000": 0.47,  // kredyt hipoteczny + konsumpcyjny
    "5000_8000": 0.38,  // głównie hipoteka, szybsza spłata długów
    above_8000:  0.22,  // hipoteka ewentualnie, brak kredytów konsumpcyjnych
  };
  const debtAgeMult = (age > 28 && age < 55) ? 1.15 : 0.82; // szczyt zadłużenia 28–55
  const hasDebtProb = Math.min(0.85, (debtBaseByIncome[incomeLevel] ?? 0.45) * debtAgeMult);

  const persona: Persona = {
    id: randomUUID(),
    name: sampleName(gender),
    demographic: {
      age,
      gender,
      education,
      region,
      settlementType,
      householdType,
    },
    financial: {
      incomeLevel,
      ownsProperty: sampleOwnsProperty(age, incomeLevel),
      hasSavings: Math.random() < (incomeLevel === "below_2000" ? 0.15 : incomeLevel === "above_8000" ? 0.82 : 0.45),
      hasDebt: Math.random() < hasDebtProb,
      creditAttitude: weightedRandom([["positive", 25], ["neutral", 40], ["negative", 35]]),
      priceSensitivity: normalInt(
        incomeLevel === "below_2000" ? 80 : incomeLevel === "above_8000" ? 30 : 55,
        14, 0, 100
      ),
    },
    psychographic: {
      ocean: {
        openness: normalInt(50 + (OPENNESS_EDU[education] ?? 0) + OPENNESS_AGE(age), 15, 0, 100),
        conscientiousness: normalInt(55 + CONSCIENTIOUSNESS_AGE(age), 15, 0, 100),
        extraversion: normalInt(50, 20, 0, 100),
        agreeableness: normalInt(55 + genderMod.agreeableness, 17, 0, 100),
        neuroticism: normalInt((age > 50 ? 40 : age < 30 ? 50 : 45) + genderMod.neuroticism, 16, 0, 100),
      },
      riskTolerance: normalInt((age < 35 ? 55 : 40) + genderMod.riskTolerance, 17, 0, 100),
      traditionalism,
      collectivism,
      institutionalTrust,
      mediaTrust,
      brandTrust: normalInt(50, 17, 0, 100),
    },
    consumer: {
      primaryCategories: sampleProductCategories(),
      brandLoyalty: normalInt(50, 20, 0, 100),
      shoppingChannels: weightedRandom([
        [["online"], 25],
        [["offline"], 35],
        [["mixed"], 40],
      ]),
      mediaHabits: sampleMediaHabits(age, settlementType),
      dailyMediaHours: normalInt(age > 50 ? 5 : 4, 2, 1, 10),
      responsiveTo: sampleCommunicationStyles(),
    },
    political: {
      affiliation,
      engagementLevel: normalInt(age > 35 ? 55 : 40, 22, 0, 100),
      euAttitude,
      securityFocus: normalInt(age > 50 ? 65 : 50, 20, 0, 100),
      climateAwareness,
      migrationAttitude,
    },
  };
  persona.brandMemory = assignBrandMemory(persona);
  return persona;
}

// ─── V&V: walidacja rozkładów post-generacji ─────────────────────────────────
// Porównuje wygenerowane marginale z celami kalibracyjnymi
// Metryki: SRMSE (Standardised Root Mean Square Error) per segment
// Próg ostrzeżenia: SRMSE > 0.05 (5% odchylenie względne)

function validateAndLog(personas: Persona[]): void {
  const n = personas.length;
  if (n === 0) return;

  const genderF   = personas.filter(p => p.demographic.gender === "female").length / n;
  const above8k   = personas.filter(p => p.financial.incomeLevel === "above_8000").length / n;
  const higher    = personas.filter(p => p.demographic.education === "higher").length / n;
  const urban     = personas.filter(p => ["large_city", "metropolis"].includes(p.demographic.settlementType)).length / n;
  const meanAge   = personas.reduce((s, p) => s + p.demographic.age, 0) / n;

  // Cele kalibracyjne dla populacji 18-80 lat (GUS BDL 2024)
  // Uwaga: wartości różnią się od ogólnopolskich przez wykluczenie 0-17 i włączenie 65+
  const TARGET_GENDER_F = 0.52;
  // meanAge dla rozkładu 18-80 GUS: ~48.1 (wynika z 21% udziału 65+, nie 43.5 dla wszystkich Polaków)
  const TARGET_MEAN_AGE = 48.1;
  // above_8000: GUS 13% dla aktywnych zawodowo; po uwzględnieniu 65+ emerytów (~21% pop)
  // i luki płacowej kobiet (84% mediany) → oczekiwane ~9-10% dla pop 18-80
  const TARGET_ABOVE8K  = 0.095;
  // Wyższe wykształcenie: GUS NSP 27%, ale structural zeros dla 18-21 obniżają do ~25%
  // (4/7 grupy 18-24 nie może mieć wyższego → oczekiwane 0.087 × 8.6% + rest × 27% ≈ 25%)
  const TARGET_HIGHER   = 0.25;
  const TARGET_URBAN    = 0.22;  // metropolis (12%) + large_city (10%)

  // SRMSE (względne odchylenia)
  const relErrors = [
    (genderF   - TARGET_GENDER_F) / TARGET_GENDER_F,
    (above8k   - TARGET_ABOVE8K)  / TARGET_ABOVE8K,
    (higher    - TARGET_HIGHER)   / TARGET_HIGHER,
    (urban     - TARGET_URBAN)    / TARGET_URBAN,
    (meanAge   - TARGET_MEAN_AGE) / TARGET_MEAN_AGE,
  ];
  const srmse = Math.sqrt(relErrors.reduce((s, e) => s + e * e, 0) / relErrors.length);

  const warn = srmse > 0.05 ? " ⚠ SRMSE przekracza 5%" : "";
  console.log(
    `[V&V] n=${n} | SRMSE=${(srmse * 100).toFixed(2)}%${warn}` +
    ` | gender_F=${(genderF * 100).toFixed(1)}% (cel:${(TARGET_GENDER_F * 100).toFixed(0)}%)` +
    ` | above8k=${(above8k * 100).toFixed(1)}% (cel:${(TARGET_ABOVE8K * 100).toFixed(1)}%)` +
    ` | higher=${(higher * 100).toFixed(1)}% (cel:${(TARGET_HIGHER * 100).toFixed(0)}%)` +
    ` | urban=${(urban * 100).toFixed(1)}% (cel:${(TARGET_URBAN * 100).toFixed(0)}%)` +
    ` | meanAge=${meanAge.toFixed(1)} (cel:${TARGET_MEAN_AGE})`,
  );
}

// ─── Household clustering (uproszczone hMCMC) ────────────────────────────────
// Przypisuje wspólny householdId do person z kompatybilnych typów gosp. domowych.
// Parowanie: para adultstów (różnica wieku ≤ 12 lat), trójki multigeneracyjne.
// Pokrycie: ~55% populacji (single i niepasujące pary pozostają bez householdId).

function clusterHouseholds(personas: Persona[]): void {
  // Przetasuj losowo (Fisher-Yates) aby uniknąć systematycznych par wg kolejności generacji
  const shuffled = fisherYates(personas);

  // ── Pary (couple_no_kids, family_*) ────────────────────────────────────────
  const couplePool = shuffled.filter(p =>
    ["couple_no_kids", "family_young_kids", "family_teen_kids", "family_adult_kids"].includes(p.demographic.householdType)
  );

  // Sortuj wg wieku dla lepszej kompatybilności par (zbliżony wiek w małżeństwach PL)
  couplePool.sort((a, b) => a.demographic.age - b.demographic.age);

  for (let i = 0; i + 1 < couplePool.length; i += 2) {
    const a = couplePool[i];
    const b = couplePool[i + 1];
    if (a.householdId || b.householdId) continue; // już sparowane
    const ageDiff = Math.abs(a.demographic.age - b.demographic.age);
    if (ageDiff <= 12) {
      const hhId = randomUUID();
      a.householdId = hhId;
      b.householdId = hhId;
    }
  }

  // ── Trójki multigeneracyjne ─────────────────────────────────────────────────
  const multiPool = shuffled.filter(p =>
    p.demographic.householdType === "multigenerational" && !p.householdId
  );
  // Posortuj: wymieszaj, żeby trójki były zróżnicowane wiekowo
  // (starszy, średni, młodszy dorosły w tym samym gosp. domowym)
  const seniors   = multiPool.filter(p => p.demographic.age >= 55);
  const midAge    = multiPool.filter(p => p.demographic.age >= 30 && p.demographic.age < 55);
  const young     = multiPool.filter(p => p.demographic.age < 30);

  const tripleCount = Math.min(seniors.length, midAge.length, young.length);
  for (let i = 0; i < tripleCount; i++) {
    const hhId = randomUUID();
    seniors[i].householdId = hhId;
    midAge[i].householdId = hhId;
    young[i].householdId = hhId;
  }

  // ── single_parent: para (rodzic + dorosłe dziecko) ─────────────────────────
  const singleParentPool = shuffled.filter(p =>
    p.demographic.householdType === "single_parent" && !p.householdId
  );
  for (let i = 0; i + 1 < singleParentPool.length; i += 2) {
    const parent = singleParentPool[i];
    const child  = singleParentPool[i + 1];
    if (parent.householdId || child.householdId) continue;
    // Rodzic musi być starszy o co najmniej 15 lat
    const [older, younger] = parent.demographic.age > child.demographic.age
      ? [parent, child] : [child, parent];
    if (older.demographic.age - younger.demographic.age >= 15) {
      const hhId = randomUUID();
      older.householdId = hhId;
      younger.householdId = hhId;
    }
  }
}

export function generatePopulation(size: number = 50): Persona[] {
  const personas = Array.from({ length: size }, generatePersona);
  clusterHouseholds(personas);
  validateAndLog(personas);
  return personas;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: tsx src/personas/generator.ts [liczba]
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("generator.ts") || process.argv[1]?.endsWith("generator.js")) {
  const { writeFileSync, mkdirSync } = await import("fs");
  const { join } = await import("path");

  const size = parseInt(process.argv[2] ?? "50", 10);
  const population = generatePopulation(size);

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const outPath = join(process.cwd(), "data", "population.json");
  writeFileSync(outPath, JSON.stringify(population, null, 2), "utf8");

  console.log(`✓ Wygenerowano ${size} person → ${outPath}`);

  // Podgląd rozkładu
  const genders = population.reduce((acc, p) => {
    acc[p.demographic.gender] = (acc[p.demographic.gender] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const settlements = population.reduce((acc, p) => {
    acc[p.demographic.settlementType] = (acc[p.demographic.settlementType] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const politics = population.reduce((acc, p) => {
    acc[p.political.affiliation] = (acc[p.political.affiliation] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const avgAge = Math.round(population.reduce((s, p) => s + p.demographic.age, 0) / size);

  console.log("\n── Rozkład populacji ──────────────────────────");
  console.log(`Wiek średni: ${avgAge} lat`);
  console.log("Płeć:", genders);
  console.log("Typ miejscowości:", settlements);
  console.log("Preferencje polityczne:", politics);
}
