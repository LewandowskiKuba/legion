// ─────────────────────────────────────────────────────────────────────────────
// CLI – uruchamianie badania z pliku JSON lub flag
// Użycie:
//   tsx src/cli.ts --ad campaign.json
//   tsx src/cli.ts --ad campaign.json --population data/population.json
//   tsx src/cli.ts --generate 50   (tylko generuje populację, bez badania)
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { generatePopulation } from "./personas/generator.js";
import { runStudy } from "./engine/runner.js";
import { aggregateResults, printReport } from "./reports/aggregator.js";
import type { AdMaterial, Persona } from "./personas/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Parsowanie argumentów
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] ?? "true";
      i++;
    }
  }
  return args;
}

// ─────────────────────────────────────────────────────────────────────────────
// Populacja – wczytaj istniejącą lub wygeneruj nową i zapisz
// ─────────────────────────────────────────────────────────────────────────────

function loadOrGeneratePopulation(
  populationPath: string | undefined,
  size: number
): Persona[] {
  const defaultPath = join(process.cwd(), "data", "population.json");
  const path = populationPath ? resolve(populationPath) : defaultPath;

  if (existsSync(path)) {
    console.log(`  Wczytywanie populacji z ${path}...`);
    const raw = readFileSync(path, "utf8");
    const pop = JSON.parse(raw) as Persona[];
    console.log(`  ✓ ${pop.length} person wczytanych.`);
    return pop;
  }

  console.log(`  Generowanie ${size} person (brak zapisanej populacji)...`);
  const pop = generatePopulation(size);
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(path, JSON.stringify(pop, null, 2), "utf8");
  console.log(`  ✓ Populacja zapisana → ${path}`);
  return pop;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Tryb: tylko generacja populacji
  if (args["generate"]) {
    const size = parseInt(args["generate"], 10);
    const outPath = join(process.cwd(), "data", "population.json");
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    const pop = generatePopulation(size);
    writeFileSync(outPath, JSON.stringify(pop, null, 2), "utf8");
    console.log(`\n✓ Wygenerowano ${size} person → ${outPath}\n`);

    const genders = pop.reduce((acc, p) => {
      acc[p.demographic.gender] = (acc[p.demographic.gender] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const politics = pop.reduce((acc, p) => {
      acc[p.political.affiliation] = (acc[p.political.affiliation] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const avgAge = Math.round(pop.reduce((s, p) => s + p.demographic.age, 0) / size);

    console.log(`Wiek średni: ${avgAge} lat`);
    console.log("Płeć:", genders);
    console.log("Polityka:", politics);
    return;
  }

  // Tryb: badanie
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ Brak ANTHROPIC_API_KEY w środowisku.");
    process.exit(1);
  }

  if (!args["ad"]) {
    console.error("✗ Podaj plik z materiałem reklamowym: --ad <plik.json>");
    console.error("\nFormat pliku ad JSON:");
    console.error(JSON.stringify({
      headline: "Nagłówek reklamy",
      body: "Treść reklamy",
      cta: "Tekst przycisku",
      brandName: "Nazwa marki (opcjonalnie)",
      productCategory: "financial_services (opcjonalnie)",
      context: "Kontekst ekspozycji (opcjonalnie)",
    }, null, 2));
    process.exit(1);
  }

  const adPath = resolve(args["ad"]);
  if (!existsSync(adPath)) {
    console.error(`✗ Plik nie istnieje: ${adPath}`);
    process.exit(1);
  }

  const ad = JSON.parse(readFileSync(adPath, "utf8")) as AdMaterial;
  const populationSize = parseInt(process.env.POPULATION_SIZE ?? "50", 10);
  const population = loadOrGeneratePopulation(args["population"], populationSize);

  console.log(`\n◆ Synthetic Population Sandbox`);
  console.log(`  Reklama: „${ad.headline}"`);
  console.log(`  Populacja: ${population.length} botów | Concurrency: ${process.env.CONCURRENCY ?? "5"}\n`);

  const start = Date.now();

  const responses = await runStudy(population, ad, (done, total) => {
    process.stdout.write(`\r  Postęp: ${done}/${total} botów (${Math.round(done / total * 100)}%)`);
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\r  ✓ ${responses.length} odpowiedzi w ${elapsed}s\n`);

  const report = aggregateResults(population, responses);
  printReport(report);

  // Zapis wyników
  mkdirSync(join(process.cwd(), "data", "results"), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(process.cwd(), "data", "results", `report_${ts}.json`);
  writeFileSync(outPath, JSON.stringify({ ad, report, responses }, null, 2), "utf8");
  console.log(`  Pełne wyniki → ${outPath}\n`);
}

main().catch((err) => {
  console.error("✗ Błąd:", err);
  process.exit(1);
});
