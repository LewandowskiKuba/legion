// ─────────────────────────────────────────────────────────────────────────────
// Persistent Personas – ładuj/zapisuj agentów z PostgreSQL
//
// Hierarchia fallbacków:
//   1. PostgreSQL (gdy DATABASE_URL dostępne i tabela personas nie pusta)
//   2. Plik JSON (data/population.json — stary fallback)
//   3. Generuj na bieżąco (ostateczny fallback)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { query, isDbAvailable } from "./client.js";
import { generatePopulation } from "../personas/generator.js";
import { enrichPopulationWithBios } from "../personas/bioEnricher.js";
import type { Persona } from "../personas/schema.js";

const DATA_DIR = join(process.cwd(), "data");
const POPULATION_PATH = join(DATA_DIR, "population.json");
const DEFAULT_SIZE = parseInt(process.env.POPULATION_SIZE ?? "100", 10);

// ── Załaduj persony (hierarchia fallbacków) ───────────────────────────────────

export async function loadPersonas(): Promise<Persona[]> {
  // 1. Próbuj z PostgreSQL
  if (await isDbAvailable()) {
    try {
      const result = await query("SELECT id, data FROM personas ORDER BY created_at");
      if (result.rows.length > 0) {
        console.log(`✓ Załadowano ${result.rows.length} agentów z PostgreSQL`);
        return result.rows.map((r: any) => r.data as Persona);
      }
    } catch (err) {
      console.warn("⚠ Błąd ładowania z PostgreSQL:", (err as Error).message);
    }
  }

  // 2. Próbuj z pliku JSON
  if (existsSync(POPULATION_PATH)) {
    const personas = JSON.parse(readFileSync(POPULATION_PATH, "utf8")) as Persona[];
    console.log(`✓ Załadowano ${personas.length} agentów z pliku JSON`);
    return personas;
  }

  // 3. Wygeneruj nowych agentów z bio enrichment i zapisz
  console.log(`⚙ Generuję ${DEFAULT_SIZE} nowych agentów...`);
  const personas = generatePopulation(DEFAULT_SIZE);
  await enrichPopulationWithBios(personas);
  await savePersonas(personas);
  return personas;
}

// ── Zapisz persony (do DB i pliku JSON) ──────────────────────────────────────

export async function savePersonas(personas: Persona[]): Promise<void> {
  // Zawsze zapisz do pliku JSON jako backup
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(POPULATION_PATH, JSON.stringify(personas, null, 2), "utf8");
  console.log(`✓ Zapisano ${personas.length} agentów do pliku JSON`);

  // Opcjonalnie: zapisz do PostgreSQL
  if (await isDbAvailable()) {
    try {
      // Upsert — aktualizuj istniejących, dodaj nowych
      for (const persona of personas) {
        await query(
          `INSERT INTO personas (id, name, data)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET data = $3`,
          [persona.id, persona.name, JSON.stringify(persona)]
        );
      }
      console.log(`✓ Zapisano ${personas.length} agentów do PostgreSQL`);
    } catch (err) {
      console.warn("⚠ Błąd zapisu do PostgreSQL:", (err as Error).message);
    }
  }
}

// ── Regeneruj populację (nowi agenci, stary zbiór usunięty) ──────────────────

export async function regeneratePersonas(size = DEFAULT_SIZE): Promise<Persona[]> {
  console.log(`⚙ Regeneruję populację (${size} agentów)...`);

  // Wyczyść starą populację z DB
  if (await isDbAvailable()) {
    try {
      await query("DELETE FROM personas");
    } catch (err) {
      console.warn("⚠ Błąd czyszczenia personas w DB:", (err as Error).message);
    }
  }

  const personas = generatePopulation(size);
  await enrichPopulationWithBios(personas);
  await savePersonas(personas);
  console.log(`✓ Populacja zregenerowana: ${personas.length} agentów`);
  return personas;
}

// ── Cache w pamięci (unikaj wielokrotnych zapytań do DB per request) ──────────

let _cachedPersonas: Persona[] | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minut

export async function getCachedPersonas(): Promise<Persona[]> {
  const now = Date.now();
  if (_cachedPersonas && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedPersonas;
  }
  _cachedPersonas = await loadPersonas();
  _cacheTimestamp = now;
  return _cachedPersonas;
}

export function invalidatePersonasCache(): void {
  _cachedPersonas = null;
}
