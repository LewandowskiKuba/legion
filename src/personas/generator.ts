// ─────────────────────────────────────────────────────────────────────────────
// Generator populacji syntetycznej
// Tworzy N person z rozkładami zgodnymi z polską strukturą demograficzną
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { Persona } from "./schema.js";
import {
  weightedRandom,
  normalInt,
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
  const incomeLevel = sampleIncomeLevel(education, settlementType);
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
      hasDebt: Math.random() < (age > 30 && age < 55 ? 0.45 : 0.25),
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
        agreeableness: normalInt(55, 17, 0, 100),
        neuroticism: normalInt(age > 50 ? 40 : age < 30 ? 50 : 45, 16, 0, 100),
      },
      riskTolerance: normalInt(age < 35 ? 55 : 40, 17, 0, 100),
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

export function generatePopulation(size: number = 50): Persona[] {
  return Array.from({ length: size }, generatePersona);
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
