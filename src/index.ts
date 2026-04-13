// ─────────────────────────────────────────────────────────────────────────────
// Synthetic Population Sandbox – entry point
// Użycie: tsx src/index.ts
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { generatePopulation } from "./personas/generator.js";
import { runStudy } from "./engine/runner.js";
import { aggregateResults, printReport } from "./reports/aggregator.js";
import type { AdMaterial } from "./personas/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Przykładowy materiał reklamowy do testów
// Zastąp własną kampanią
// ─────────────────────────────────────────────────────────────────────────────

const AD: AdMaterial = {
  headline: "Kup teraz, zapłać za 30 dni – bez odsetek",
  body: `Sprawdzone przez ponad 2 miliony Polaków. Zakupy online bez stresu – bierzesz, sprawdzasz w domu, decydujesz czy zostawiasz. Dopiero wtedy płacisz. Żadnych ukrytych kosztów, żadnych pułapek.`,
  cta: "Aktywuj bezpłatnie",
  brandName: "PayLater Polska",
  productCategory: "financial_services",
  context: "Reklama displayowa wyświetlona podczas przeglądania sklepu internetowego z elektroniką",
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ Brak zmiennej ANTHROPIC_API_KEY w środowisku.");
    console.error("  Skopiuj .env.example → .env i uzupełnij klucz API.");
    process.exit(1);
  }

  const populationSize = parseInt(process.env.POPULATION_SIZE ?? "50", 10);

  console.log(`\n◆ Synthetic Population Sandbox`);
  console.log(`  Generowanie ${populationSize} person...`);
  const population = generatePopulation(populationSize);

  console.log(`  Uruchamianie badania (CONCURRENCY=${process.env.CONCURRENCY ?? "5"})...`);
  console.log(`  Reklama: „${AD.headline}"\n`);

  const startTime = Date.now();

  const responses = await runStudy(population, AD, (done, total) => {
    const pct = Math.round((done / total) * 100);
    process.stdout.write(`\r  Postęp: ${done}/${total} botów (${pct}%)`);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\r  Zakończono: ${responses.length} odpowiedzi w ${elapsed}s\n`);

  const report = aggregateResults(population, responses);
  printReport(report);

  // Zapis wyników
  mkdirSync(join(process.cwd(), "data", "results"), { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(process.cwd(), "data", "results", `report_${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify({ ad: AD, population, responses, report }, null, 2), "utf8");
  console.log(`  Pełne wyniki zapisane → ${reportPath}\n`);
}

main().catch((err) => {
  console.error("✗ Krytyczny błąd:", err);
  process.exit(1);
});
