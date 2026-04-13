// ─────────────────────────────────────────────────────────────────────────────
// Brand Memory Layer
// Przypisuje historię interakcji z markami na podstawie profilu persony.
// Źródło słownika: data/brands/polish_brands.json
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { join } from "path";
import type { Persona, BrandMemoryLayer, BrandMemoryEntry } from "./schema.js";
import { weightedRandom } from "./distributions.js";

interface BrandDefinition {
  brandName: string;
  category: string;
  awareness: number;                              // bazowe prawdop. że persona zna markę
  sentimentWeights: { negative: number; neutral: number; positive: number };
  ageAffinity: [number, number];                  // [minAge, maxAge] – wzmacnia znajomość
  incomeAffinity: string[];                       // income levels z pozytywnym sentymentem
  settlementBoost: string[];                      // typy miejscowości wzmacniające awareness
  tags: string[];
}

let _brands: BrandDefinition[] | null = null;

function loadBrands(): BrandDefinition[] {
  if (_brands) return _brands;
  const filePath = join(process.cwd(), "data", "brands", "polish_brands.json");
  _brands = JSON.parse(readFileSync(filePath, "utf8")) as BrandDefinition[];
  return _brands;
}

function computeAwareness(brand: BrandDefinition, persona: Persona): number {
  let p = brand.awareness;

  // Wzmocnienie wiekowe – persona w przedziale affinity zna markę lepiej
  const ageAffinity: [number, number] = brand.ageAffinity ?? [18, 80];
  const [minAge, maxAge] = ageAffinity;
  if (persona.demographic.age >= minAge && persona.demographic.age <= maxAge) {
    p = Math.min(1, p + 0.1);
  } else {
    p = Math.max(0.1, p - 0.15);
  }

  // Wzmocnienie geograficzne
  const settlementBoost: string[] = brand.settlementBoost ?? [];
  if (settlementBoost.includes(persona.demographic.settlementType)) {
    p = Math.min(1, p + 0.08);
  }

  return p;
}

function computeSentiment(
  brand: BrandDefinition,
  persona: Persona,
): -1 | 0 | 1 {
  const w = { ...brand.sentimentWeights };

  // Persona z dochodem w income affinity – boost positive
  const incomeAffinity: string[] = brand.incomeAffinity ?? [];
  if (incomeAffinity.includes(persona.financial.incomeLevel)) {
    w.positive += 15;
  } else {
    w.negative += 10;
  }

  // Wysoka wrażliwość cenowa → większy sceptycyzm wobec marek premium
  if (persona.financial.priceSensitivity > 70) {
    w.negative += 8;
    w.positive = Math.max(0, w.positive - 8);
  }

  // Niska ufność w marki → neutralniejszy lub negatywniejszy
  if (persona.psychographic.brandTrust < 35) {
    w.negative += 10;
    w.neutral += 10;
    w.positive = Math.max(0, w.positive - 10);
  } else if (persona.psychographic.brandTrust > 65) {
    w.positive += 10;
  }

  const result = weightedRandom<-1 | 0 | 1>([
    [-1, w.negative],
    [0, w.neutral],
    [1, w.positive],
  ]);
  return result;
}

function pickInteractionType(
  sentiment: -1 | 0 | 1,
): BrandMemoryEntry["lastInteractionType"] {
  if (sentiment === 1) {
    return weightedRandom([
      ["used", 50],
      ["considered", 30],
      ["just_heard", 20],
    ]);
  }
  if (sentiment === -1) {
    return weightedRandom([
      ["rejected", 40],
      ["used", 20],
      ["just_heard", 40],
    ]);
  }
  return weightedRandom([
    ["just_heard", 40],
    ["considered", 30],
    ["used", 30],
  ]);
}

/**
 * Buduje BrandMemoryLayer dla persony na podstawie słownika marek.
 * Nie każda persona zna każdą markę – prawdopodobieństwo zależy od demografii.
 */
export function assignBrandMemory(persona: Persona): BrandMemoryLayer {
  const brands = loadBrands();
  const entries: BrandMemoryEntry[] = [];

  // Filtrujemy do marek relevantnych dla kategorii zakupowych persony
  // + zawsze dodajemy marki o bardzo wysokiej znajomości (>90%)
  const relevantBrands = brands.filter(
    (b) =>
      b.awareness >= 0.9 ||
      persona.consumer.primaryCategories.includes(b.category as any),
  );

  for (const brand of relevantBrands) {
    const awarenessProb = computeAwareness(brand, persona);
    const isAware = Math.random() < awarenessProb;

    if (!isAware) continue;

    const sentiment = computeSentiment(brand, persona);
    const lastInteractionType = pickInteractionType(sentiment);

    entries.push({
      brandName: brand.brandName,
      awareness: true,
      sentiment,
      lastInteractionType,
    });
  }

  return { brands: entries };
}
