// ─────────────────────────────────────────────────────────────────────────────
// Bio Enricher – dodaje zawód i krótkie bio do person przez LLM
// Używa modelu NER (szybki/tani) w batchach po 8 person
// ─────────────────────────────────────────────────────────────────────────────

import { callNerModel } from "../engine/runner.js";
import type { Persona } from "./schema.js";

const BATCH_SIZE = 8;

interface PersonaBioResult {
  id: string;
  zawod: string;
  bio: string;
}

// Mapuje wykształcenie na opis po polsku
const EDU_PL: Record<string, string> = {
  primary: "podstawowe",
  vocational: "zawodowe",
  secondary: "średnie",
  higher: "wyższe",
};

const INCOME_PL: Record<string, string> = {
  below_2000: "niskie (poniżej 2000 zł)",
  "2000_3500": "niskie-średnie (2000–3500 zł)",
  "3500_5000": "średnie (3500–5000 zł)",
  "5000_8000": "wyższe-średnie (5000–8000 zł)",
  above_8000: "wysokie (powyżej 8000 zł)",
};

const SETTLEMENT_PL: Record<string, string> = {
  village: "wieś",
  small_city: "małe miasto",
  medium_city: "średnie miasto",
  large_city: "duże miasto",
  metropolis: "metropolia",
};

function personaToPromptRow(p: Persona): string {
  const d = p.demographic;
  const f = p.financial;
  return `{id:"${p.id}", imię:"${p.name}", wiek:${d.age}, płeć:"${d.gender === "male" ? "M" : "K"}", wykształcenie:"${EDU_PL[d.education]}", miejsce:"${SETTLEMENT_PL[d.settlementType]}", dochód:"${INCOME_PL[f.incomeLevel]}"}`;
}

async function enrichBatch(batch: Persona[]): Promise<PersonaBioResult[]> {
  const rows = batch.map(personaToPromptRow).join("\n");

  const userPrompt = `Dla każdej z poniższych osób napisz:
1. zawod: krótki tytuł zawodowy/rola (max 4 słowa, po polsku, np. "nauczyciel matematyki", "kierowca ciężarówki", "specjalistka HR", "emeryt")
2. bio: 2 zdania opisujące tę osobę — jej codzienność, wartości lub stosunek do mediów (po polsku, naturalnie, bez klisz)

Dane wejściowe (jeden JSON na linię):
${rows}

Odpowiedz WYŁĄCZNIE w JSON (tablica):
[
  {"id": "...", "zawod": "...", "bio": "..."},
  ...
]`;

  try {
    const raw = await callNerModel(
      "Jesteś twórcą realistycznych profili polskich konsumentów. Piszesz po polsku. Odpowiadasz wyłącznie w JSON.",
      userPrompt,
      1200
    );

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed: PersonaBioResult[] = JSON.parse(match[0]);
    return parsed.filter(
      (r) => typeof r.id === "string" && typeof r.zawod === "string" && typeof r.bio === "string"
    );
  } catch (err) {
    console.warn("⚠ bioEnricher batch error:", (err as Error).message);
    return [];
  }
}

// Wzbogaca całą populację o zawód i bio (in-place)
export async function enrichPopulationWithBios(personas: Persona[]): Promise<void> {
  const batches: Persona[][] = [];
  for (let i = 0; i < personas.length; i += BATCH_SIZE) {
    batches.push(personas.slice(i, i + BATCH_SIZE));
  }

  console.log(`⚙ Bio enrichment: ${personas.length} person w ${batches.length} batchach...`);

  // Sekwencyjnie (unika rate-limit)
  for (const batch of batches) {
    const results = await enrichBatch(batch);
    for (const r of results) {
      const persona = personas.find((p) => p.id === r.id);
      if (persona) {
        persona.zawod = r.zawod;
        persona.bio = r.bio;
      }
    }
  }

  const enriched = personas.filter((p) => p.bio).length;
  console.log(`✓ Bio enrichment zakończony: ${enriched}/${personas.length} person wzbogaconych`);
}
