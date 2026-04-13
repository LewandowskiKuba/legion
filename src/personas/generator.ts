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
  sampleEducation,
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

function generatePersona(): Persona {
  const gender = sampleGender();
  const age = sampleAge();

  const education = sampleEducation();
  const settlementType = sampleSettlementType();
  const region = sampleRegion();
  const incomeLevel = sampleIncomeLevel(education, settlementType);

  // OCEAN – korelacje z wiekiem i wykształceniem (uproszczone)
  const eduOpenness = { primary: -10, vocational: -5, secondary: 0, higher: 10 }[education];
  const ageNeuroticism = age > 50 ? -5 : age < 30 ? 5 : 0;

  const persona: Persona = {
    id: randomUUID(),
    name: sampleName(gender),
    demographic: {
      age,
      gender,
      education,
      region,
      settlementType,
      householdType: sampleHousehold(age, gender),
    },
    financial: {
      incomeLevel,
      ownsProperty: sampleOwnsProperty(age, incomeLevel),
      hasSavings: Math.random() < (incomeLevel === "below_2000" ? 0.2 : incomeLevel === "above_8000" ? 0.8 : 0.45),
      hasDebt: Math.random() < (age > 30 && age < 55 ? 0.45 : 0.25),
      creditAttitude: weightedRandom([["positive", 25], ["neutral", 40], ["negative", 35]]),
      priceSensitivity: normalInt(
        incomeLevel === "below_2000" ? 75 : incomeLevel === "above_8000" ? 35 : 55,
        15, 0, 100
      ),
    },
    psychographic: {
      ocean: {
        openness: normalInt(50 + eduOpenness, 18, 0, 100),
        conscientiousness: normalInt(55, 18, 0, 100),
        extraversion: normalInt(50, 20, 0, 100),
        agreeableness: normalInt(55, 18, 0, 100),
        neuroticism: normalInt(45 + ageNeuroticism, 18, 0, 100),
      },
      riskTolerance: normalInt(age < 35 ? 55 : 40, 18, 0, 100),
      traditionalism: normalInt(age > 55 ? 65 : age < 35 ? 40 : 50, 20, 0, 100),
      collectivism: normalInt(50, 18, 0, 100),
      institutionalTrust: normalInt(45, 20, 0, 100),
      mediaTrust: normalInt(40, 20, 0, 100),
      brandTrust: normalInt(50, 18, 0, 100),
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
      affiliation: samplePoliticalAffiliation(age, settlementType),
      engagementLevel: normalInt(age > 35 ? 55 : 40, 22, 0, 100),
      euAttitude: normalInt(settlementType === "metropolis" ? 65 : 50, 22, 0, 100),
      securityFocus: normalInt(age > 50 ? 65 : 50, 20, 0, 100),
      climateAwareness: normalInt(age < 40 ? 60 : 45, 22, 0, 100),
      migrationAttitude: normalInt(age > 50 ? 40 : 50, 22, 0, 100),
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
