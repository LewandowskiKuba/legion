// ─────────────────────────────────────────────────────────────────────────────
// Agregator wyników + raport po segmentach
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona, BotResponse } from "../personas/schema.js";

export interface SegmentStats {
  label: string;
  count: number;
  attentionScore: number;
  resonanceScore: number;
  purchaseIntentDelta: number;
  trustImpact: number;
  brandRecognitionScore: number;
  topRejections: string[];
}

export interface StudyReport {
  meta: {
    populationSize: number;
    model: string;
    timestamp: string;
  };
  aggregate: SegmentStats;
  byGender: Record<string, SegmentStats>;
  byAgeGroup: Record<string, SegmentStats>;
  bySettlement: Record<string, SegmentStats>;
  byIncome: Record<string, SegmentStats>;
  topRecalls: string[];
  topWom: string[];
  allRejections: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function ageGroup(age: number): string {
  if (age < 25) return "18–24";
  if (age < 35) return "25–34";
  if (age < 45) return "35–44";
  if (age < 55) return "45–54";
  if (age < 65) return "55–64";
  return "65+";
}

function topN(items: string[], n = 5): string[] {
  const freq: Record<string, number> = {};
  for (const item of items) {
    if (item.trim()) freq[item.trim()] = (freq[item.trim()] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([text, count]) => `[${count}x] ${text}`);
}

function buildStats(
  label: string,
  responses: BotResponse[]
): SegmentStats {
  const rejections = responses.flatMap((r) => r.rejectionSignals).filter(Boolean);
  return {
    label,
    count: responses.length,
    attentionScore: avg(responses.map((r) => r.attentionScore)),
    resonanceScore: avg(responses.map((r) => r.resonanceScore)),
    purchaseIntentDelta: avg(responses.map((r) => r.purchaseIntentDelta)),
    trustImpact: avg(responses.map((r) => r.trustImpact)),
    brandRecognitionScore: avg(responses.map((r) => r.brandRecognitionScore ?? 0)),
    topRejections: topN(rejections, 3),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Główna funkcja
// ─────────────────────────────────────────────────────────────────────────────

export function aggregateResults(
  population: Persona[],
  responses: BotResponse[]
): StudyReport {
  // Zbuduj mapę persona.id → persona
  const personaMap = new Map(population.map((p) => [p.id, p]));

  // Pogrupuj odpowiedzi według segmentów
  const byGenderMap: Record<string, BotResponse[]> = {};
  const byAgeGroupMap: Record<string, BotResponse[]> = {};
  const bySettlementMap: Record<string, BotResponse[]> = {};
  const byIncomeMap: Record<string, BotResponse[]> = {};

  for (const resp of responses) {
    const persona = personaMap.get(resp.personaId);
    if (!persona) continue;

    const { gender, settlementType, age } = persona.demographic;
    const { incomeLevel } = persona.financial;
    const ag = ageGroup(age);

    (byGenderMap[gender] ??= []).push(resp);
    (byAgeGroupMap[ag] ??= []).push(resp);
    (bySettlementMap[settlementType] ??= []).push(resp);
    (byIncomeMap[incomeLevel] ??= []).push(resp);
  }

  const allRejections = responses
    .flatMap((r) => r.rejectionSignals)
    .filter((s) => s && !s.startsWith("ERROR"));

  const topRecalls = topN(
    responses.map((r) => r.recall).filter(Boolean),
    5
  );

  const topWom = responses
    .map((r) => r.womSimulation)
    .filter(Boolean)
    .slice(0, 5);

  return {
    meta: {
      populationSize: responses.length,
      model: process.env.MODEL ?? "claude-sonnet-4-6",
      timestamp: new Date().toISOString(),
    },
    aggregate: buildStats("Cała populacja", responses),
    byGender: Object.fromEntries(
      Object.entries(byGenderMap).map(([k, v]) => [k, buildStats(k, v)])
    ),
    byAgeGroup: Object.fromEntries(
      Object.entries(byAgeGroupMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, buildStats(k, v)])
    ),
    bySettlement: Object.fromEntries(
      Object.entries(bySettlementMap).map(([k, v]) => [k, buildStats(k, v)])
    ),
    byIncome: Object.fromEntries(
      Object.entries(byIncomeMap).map(([k, v]) => [k, buildStats(k, v)])
    ),
    topRecalls,
    topWom,
    allRejections: topN(allRejections, 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Czytelny wydruk w konsoli
// ─────────────────────────────────────────────────────────────────────────────

export function printReport(report: StudyReport): void {
  const line = "─".repeat(60);
  const { aggregate: a } = report;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  SYNTHETIC POPULATION SANDBOX – RAPORT BADANIA");
  console.log(`${"═".repeat(60)}`);
  console.log(`  Populacja: ${report.meta.populationSize} botów | Model: ${report.meta.model}`);
  console.log(`  Data: ${report.meta.timestamp}`);
  console.log(`${"═".repeat(60)}\n`);

  console.log("── WYNIKI AGREGAT ─────────────────────────────────────");
  console.log(`  Attention Score:       ${a.attentionScore}/10`);
  console.log(`  Resonance Score:       ${a.resonanceScore}/10`);
  console.log(`  Purchase Intent Delta: ${a.purchaseIntentDelta > 0 ? "+" : ""}${a.purchaseIntentDelta}`);
  console.log(`  Trust Impact:          ${a.trustImpact > 0 ? "+" : ""}${a.trustImpact}`);

  if (a.topRejections.length > 0) {
    console.log(`\n  Główne sygnały odrzucenia:`);
    a.topRejections.forEach((r) => console.log(`    • ${r}`));
  }

  console.log(`\n${line}`);
  console.log("── SEGMENTACJA: PŁEĆ ──────────────────────────────────");
  printSegments(report.byGender);

  console.log(`\n${line}`);
  console.log("── SEGMENTACJA: WIEK ──────────────────────────────────");
  printSegments(report.byAgeGroup);

  console.log(`\n${line}`);
  console.log("── SEGMENTACJA: TYP MIEJSCOWOŚCI ──────────────────────");
  printSegments(report.bySettlement);

  console.log(`\n${line}`);
  console.log("── CO ZAPAMIĘTALI (TOP RECALL) ────────────────────────");
  report.topRecalls.forEach((r) => console.log(`  • ${r}`));

  console.log(`\n${line}`);
  console.log("── CO BY POWIEDZIELI ZNAJOMEMU (WOM SAMPLE) ───────────");
  report.topWom.slice(0, 3).forEach((r) => console.log(`  „${r}"`));

  console.log(`\n${"═".repeat(60)}\n`);
}

function printSegments(segments: Record<string, SegmentStats>): void {
  for (const [, s] of Object.entries(segments)) {
    console.log(
      `  ${s.label.padEnd(22)} n=${String(s.count).padStart(3)}` +
      `  ATT:${s.attentionScore.toFixed(1)}  RES:${s.resonanceScore.toFixed(1)}` +
      `  PI:${s.purchaseIntentDelta > 0 ? "+" : ""}${s.purchaseIntentDelta.toFixed(1)}` +
      `  TR:${s.trustImpact > 0 ? "+" : ""}${s.trustImpact.toFixed(1)}`
    );
  }
}
