// ─────────────────────────────────────────────────────────────────────────────
// Serwer HTTP – formularz + A/B + segment targeting + social spread + deep dive
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { generatePopulation } from "./personas/generator.js";
import { callSmartModel } from "./engine/runner.js";
import { runSpreadSimulation } from "./engine/spread.js";
import type { StudyReport } from "./reports/aggregator.js";
import { computeBayesianAB } from "./reports/bayesian.js";
import { generatePDF } from "./reports/pdf.js";
import type { AdMaterial, Persona, BotResponse } from "./personas/schema.js";
import { simulationStore } from "./simulation/stateStore.js";
import type { SimulationConfig, SimulationEventType, Platform } from "./simulation/schema.js";
import { getCachedPersonas, regeneratePersonas, invalidatePersonasCache } from "./db/personas.js";
import { fetchRelevantMarkets, getCachedMarkets, getCacheAge } from "./polymarket/index.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const DATA_DIR = join(process.cwd(), "data");
const POPULATION_PATH = join(DATA_DIR, "population.json");
const RESULTS_DIR = join(DATA_DIR, "results");
const TEMP_DIR = join(DATA_DIR, "temp");

// Synchroniczny fallback dla starych endpointów (ad-testing)
function getPopulation(): Persona[] {
  if (existsSync(POPULATION_PATH)) {
    return JSON.parse(readFileSync(POPULATION_PATH, "utf8")) as Persona[];
  }
  const size = parseInt(process.env.POPULATION_SIZE ?? "7000", 10);
  const pop = generatePopulation(size);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(POPULATION_PATH, JSON.stringify(pop, null, 2), "utf8");
  return pop;
}

interface PopFilter {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  settlement?: string;
  income?: string;
}

function filterPersonas(population: Persona[], f: PopFilter): Persona[] {
  let pop = population;
  if (f.gender && f.gender !== "all") pop = pop.filter((x) => x.demographic.gender === f.gender);
  if (f.ageMin && f.ageMin > 0) pop = pop.filter((x) => x.demographic.age >= f.ageMin!);
  if (f.ageMax && f.ageMax < 99) pop = pop.filter((x) => x.demographic.age <= f.ageMax!);
  if (f.settlement && f.settlement !== "all") pop = pop.filter((x) => x.demographic.settlementType === f.settlement);
  if (f.income && f.income !== "all") pop = pop.filter((x) => x.financial.incomeLevel === f.income);
  return pop.length >= 30 ? pop : population; // fallback gdy filtr za restrykcyjny
}

function buildSimConfig(
  ad: AdMaterial,
  population: Persona[],
  opts: { studyName: string; totalRounds: number; platform: Platform; activeAgentRatio: number }
): SimulationConfig {
  return {
    studyName: opts.studyName,
    seedType: "ad",
    ad,
    population,
    totalRounds: opts.totalRounds,
    platform: opts.platform,
    activeAgentRatio: opts.activeAgentRatio,
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Strip /adstest prefix so routes work regardless of ngrok path routing
  const BASE_PREFIX = "/adstest";
  if (url.pathname.startsWith(BASE_PREFIX + "/") || url.pathname === BASE_PREFIX) {
    url.pathname = url.pathname.slice(BASE_PREFIX.length) || "/";
  }

  // Preflight CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // ── Health check ───────────────────────────────────────────────────────────
  if (url.pathname === "/api/health" && req.method === "GET") {
    res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: Math.round(process.uptime()) }));
    return;
  }

  // ── API: Polymarket markets ────────────────────────────────────────────────
  if (url.pathname === "/api/polymarket/markets" && req.method === "GET") {
    const refresh = url.searchParams.get("refresh") === "1";
    const markets = refresh ? await fetchRelevantMarkets() : getCachedMarkets();
    const cacheAge = getCacheAge();
    json(res, { markets, cacheAgeMs: cacheAge, count: markets.length });
    return;
  }

  // ── Stary UI (legacy HTML) – wyłączony, zastąpiony przez React frontend ────
  // if (url.pathname === "/" && req.method === "GET") {
  //   res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  //   res.end(HTML);
  //   return;
  // }

  // ── API: Population stats ──────────────────────────────────────────────────
  if (url.pathname === "/api/population" && req.method === "GET") {
    const population = await getCachedPersonas();
    const stats = {
      total: population.length,
      avgAge: Math.round(population.reduce((s, p) => s + p.demographic.age, 0) / population.length),
      gender: population.reduce((acc, p) => { acc[p.demographic.gender] = (acc[p.demographic.gender] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      settlement: population.reduce((acc, p) => { acc[p.demographic.settlementType] = (acc[p.demographic.settlementType] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      incomeLevel: population.reduce((acc, p) => { acc[p.financial.incomeLevel] = (acc[p.financial.incomeLevel] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      education: population.reduce((acc, p) => { acc[p.demographic.education] = (acc[p.demographic.education] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      political: population.reduce((acc, p) => { acc[p.political.affiliation] = (acc[p.political.affiliation] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      ageBrackets: (() => {
        const brackets: Record<string, number> = { "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55-64": 0, "65-74": 0, "75+": 0 };
        for (const p of population) {
          const a = p.demographic.age;
          if (a <= 24) brackets["18-24"]++;
          else if (a <= 34) brackets["25-34"]++;
          else if (a <= 44) brackets["35-44"]++;
          else if (a <= 54) brackets["45-54"]++;
          else if (a <= 64) brackets["55-64"]++;
          else if (a <= 74) brackets["65-74"]++;
          else brackets["75+"]++;
        }
        return brackets;
      })(),
    };
    json(res, stats);
    return;
  }

  // ── API: Regeneruj populację agentów ──────────────────────────────────────
  if (url.pathname === "/api/population/regenerate" && req.method === "POST") {
    try {
      const body = await readBody(req).then(JSON.parse).catch(() => ({}));
      const size = Math.min(Math.max(Number(body.size ?? process.env.POPULATION_SIZE ?? 7000), 10), 10000);
      const personas = await regeneratePersonas(size);
      invalidatePersonasCache();
      json(res, { success: true, count: personas.length });
    } catch (err: any) {
      json(res, { error: String(err.message ?? err) }, 500);
    }
    return;
  }

  // ── API: Campaigns list ────────────────────────────────────────────────────
  if (url.pathname === "/api/campaigns" && req.method === "GET") {
    const { readdirSync } = await import("fs");
    const campaignsDir = join(process.cwd(), "campaigns");
    try {
      const files = readdirSync(campaignsDir).filter(f => f.endsWith(".json"));
      const campaigns = files.map(f => {
        const data = JSON.parse(readFileSync(join(campaignsDir, f), "utf8"));
        return { file: f, ...data };
      });
      json(res, campaigns);
    } catch {
      json(res, []);
    }
    return;
  }

  // ── API: Brands list ───────────────────────────────────────────────────────
  if (url.pathname === "/api/brands" && req.method === "GET") {
    const brandsPath = join(process.cwd(), "data", "brands", "polish_brands.json");
    try {
      const brands = JSON.parse(readFileSync(brandsPath, "utf8"));
      json(res, brands);
    } catch {
      json(res, []);
    }
    return;
  }

  // ── API: Single result by file id ─────────────────────────────────────────
  if (url.pathname.startsWith("/api/results/") && req.method === "GET") {
    const fileId = url.pathname.replace("/api/results/", "");
    // fileId may be just the timestamp part or the full filename
    const candidates = [
      `${fileId}.json`,
      `report_${fileId}.json`,
      `report_ab_${fileId}.json`,
    ];
    let found = false;
    for (const fname of candidates) {
      const fpath = join(RESULTS_DIR, fname);
      if (existsSync(fpath)) {
        const data = JSON.parse(readFileSync(fpath, "utf8"));
        json(res, { file: fname, ts: fileId, ...data });
        found = true;
        break;
      }
    }
    if (!found) json(res, { error: "Not found" }, 404);
    return;
  }

  // ── API: Results history ───────────────────────────────────────────────────
  if (url.pathname === "/api/results" && req.method === "GET") {
    const { readdirSync } = await import("fs");
    try {
      const files = readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, 20);
      const results = files.map(f => {
        const data = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8"));
        return { file: f, ts: f.replace(/^report_?(ab_)?/, "").replace(".json", ""), ...data };
      });
      json(res, results);
    } catch {
      json(res, []);
    }
    return;
  }

  // ── API: Upload Creative ───────────────────────────────────────────────────
  if (url.pathname === "/api/upload-creative" && req.method === "POST") {
    const body = await readBody(req);
    let parsed: { base64: string; mimeType: string; filename?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return json(res, { error: "Invalid JSON" }, 400);
    }

    const ALLOWED: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png",
      "image/gif": "gif", "image/webp": "webp",
    };
    const ext = ALLOWED[parsed.mimeType];
    if (!ext) return json(res, { error: "Nieobsługiwany format. Dozwolone: JPEG, PNG, GIF, WEBP." }, 400);

    const creativeId = randomUUID();
    try {
      mkdirSync(TEMP_DIR, { recursive: true });
      const filePath = join(TEMP_DIR, `${creativeId}.${ext}`);
      writeFileSync(filePath, Buffer.from(parsed.base64, "base64"));
    } catch (e: any) {
      return json(res, { error: `Błąd zapisu pliku: ${e.message}` }, 500);
    }

    return json(res, { creativeId, mimeType: parsed.mimeType });
  }

  // ── API: Executive Summary ────────────────────────────────────────────────
  if (url.pathname === "/api/summarize" && req.method === "POST") {
    const body = await readBody(req);
    const { reportA, reportB, adA, filterDesc } = JSON.parse(body) as {
      reportA: StudyReport;
      reportB?: StudyReport;
      adA: AdMaterial;
      filterDesc?: string;
    };
    try {

      const agg = reportA.aggregate;
      const segAge = Object.values(reportA.byAgeGroup ?? {}) as Array<{ label: string; attentionScore: number }>;
      const topRecall = (reportA.topRecalls ?? []).slice(0, 3).join(", ");
      const topWom = (reportA.topWom ?? []).slice(0, 2).join(" | ");
      const rejections = (reportA.allRejections ?? []).slice(0, 3).join(", ");

      const bestAge = segAge.length ? segAge.reduce((a, b) => (b.attentionScore > a.attentionScore ? b : a)) : null;
      const worstAge = segAge.length ? segAge.reduce((a, b) => (b.attentionScore < a.attentionScore ? b : a)) : null;

      const abSection = reportB
        ? `\nWariant B: headline="${adA.headline}", attention=${reportB.aggregate?.attentionScore?.toFixed(1)}, resonance=${reportB.aggregate?.resonanceScore?.toFixed(1)}`
        : "";

      const prompt = `Jesteś analitykiem badań reklamowych. Przeanalizuj wyniki badania na syntetycznej populacji polskich konsumentów i napisz zwięzłe executive summary (5-8 zdań) wyjaśniające DLACZEGO kreacja uzyskała takie wyniki.

KREACJA (wariant A):
- Headline: "${adA.headline}"
- Body: "${adA.body}"
- CTA: "${adA.cta}"
- Marka: ${adA.brandName ?? "nieokreślona"}
- Kategoria: ${adA.productCategory ?? "nieokreślona"}
- Kontekst: ${adA.context ?? "nieokreślony"}
${filterDesc ? `- Segment docelowy: ${filterDesc}` : ""}

WYNIKI (n=${agg?.count ?? "?"}):
- Attention Score: ${agg?.attentionScore?.toFixed(1)}/10
- Resonance: ${agg?.resonanceScore?.toFixed(1)}/10
- Purchase Intent Δ: +${agg?.purchaseIntentDelta?.toFixed(1)}%
- Trust Δ: +${agg?.trustImpact?.toFixed(1)}%
- Najlepszy segment wiekowy: ${bestAge?.label ?? "?"} (attention ${bestAge?.attentionScore?.toFixed(1)})
- Najsłabszy segment wiekowy: ${worstAge?.label ?? "?"} (attention ${worstAge?.attentionScore?.toFixed(1)})
- Zapamiętane elementy: ${topRecall || "brak danych"}
- Przykłady WOM: ${topWom || "brak"}
- Główne odrzucenia: ${rejections || "brak"}
${abSection}

Napisz analizę po polsku. Wyjaśnij przyczyny wyników (np. niska świadomość marki, niedopasowanie grupy docelowej, siła/słabość komunikatu). Bądź konkretny – odwołuj się do liczb i segmentów. Zakończ jednym zdaniem z rekomendacją.`;

      const summary = await callSmartModel(
        "Jesteś analitykiem badań reklamowych. Piszesz po polsku.",
        prompt,
        600,
      );
      json(res, { summary });
    } catch (err) {
      json(res, { error: String(err) }, 500);
    }
    return;
  }

  // ── API: Social Spread ────────────────────────────────────────────────────
  if (url.pathname === "/api/spread" && req.method === "POST") {
    if (!process.env.ANTHROPIC_API_KEY) { res.writeHead(500, CORS_HEADERS); res.end(); return; }
    const body = await readBody(req);
    const { responsesA, population } = JSON.parse(body) as {
      responsesA: BotResponse[];
      population: Persona[];
    };
    try {
      const spreadReport = await runSpreadSimulation(population, responsesA);
      json(res, spreadReport);
    } catch (err) {
      json(res, { error: String(err) }, 500);
    }
    return;
  }

  // ── API: PDF export ───────────────────────────────────────────────────────
  if (url.pathname === "/api/export-pdf" && req.method === "POST") {
    const body = await readBody(req);
    const { reportA, reportB, adA, adB } = JSON.parse(body);
    const pdf = generatePDF(adA, reportA, adB, reportB);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=raport-sandbox.pdf",
      "Content-Length": pdf.length,
      ...CORS_HEADERS,
    });
    res.end(pdf);
    return;
  }

  // ── API: Lista symulacji ──────────────────────────────────────────────────
  if (url.pathname === "/api/simulations" && req.method === "GET") {
    json(res, simulationStore.listAll());
    return;
  }

  // ── API: Utwórz nową symulację ────────────────────────────────────────────
  if (url.pathname === "/api/simulation" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const population = await getCachedPersonas();

      const seedType = body.seedType === "topic" ? "topic" : "ad";

      const config: SimulationConfig = {
        studyName: body.studyName ?? "Symulacja",
        seedType,
        ad: seedType === "ad" ? (body.ad as AdMaterial) : undefined,
        topic: seedType === "topic" ? {
          query: String(body.topic?.query ?? ""),
          context: body.topic?.context ? String(body.topic.context) : undefined,
          expectedImpacts: Array.isArray(body.topic?.expectedImpacts)
            ? body.topic.expectedImpacts.map(String)
            : undefined,
        } : undefined,
        population,
        totalRounds: Math.min(Math.max(Number(body.totalRounds ?? 5), 1), 20),
        platform: (body.platform ?? "facebook") as Platform,
        activeAgentRatio: Math.min(Math.max(Number(body.activeAgentRatio ?? 0.7), 0.1), 1),
      };

      if (seedType === "ad" && !config.ad?.headline) {
        json(res, { error: "Brak materiału reklamowego (ad.headline wymagany)" }, 400);
        return;
      }
      if (seedType === "topic" && !config.topic?.query) {
        json(res, { error: "Brak opisu scenariusza (topic.query wymagany)" }, 400);
        return;
      }

      const orc = await simulationStore.create(config);
      const simId = orc.getId();

      // Inicjalizacja (GraphRAG) asynchronicznie
      orc.initialize().catch((err) => {
        console.error(`⚠ Symulacja ${simId} init error:`, err.message);
      });

      json(res, { simulationId: simId });
    } catch (err: any) {
      json(res, { error: String(err.message ?? err) }, 400);
    }
    return;
  }

  // ── API: Test A/B — dwie kreacje, ta sama populacja ─────────────────────
  if (url.pathname === "/api/simulation/ab" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const { adA, adB, filter = {}, totalRounds = 5, platform = "facebook", activeAgentRatio = 0.7, studyName = "Test A/B" } = body;

      if (!adA?.headline && !adA?.creativeId) {
        json(res, { error: "Wariant A: brak materiału (headline lub kreacja)" }, 400); return;
      }
      if (!adB?.headline && !adB?.creativeId) {
        json(res, { error: "Wariant B: brak materiału (headline lub kreacja)" }, 400); return;
      }

      const fullPop = await getCachedPersonas();
      const population = filterPersonas(fullPop, filter); // jedna próbka dla obu

      const opts = {
        totalRounds: Math.min(Math.max(Number(totalRounds), 1), 20),
        platform: (platform ?? "facebook") as Platform,
        activeAgentRatio: Math.min(Math.max(Number(activeAgentRatio), 0.1), 1),
      };

      const configA = buildSimConfig(adA as AdMaterial, population, { studyName: `${studyName} – A`, ...opts });
      const configB = buildSimConfig(adB as AdMaterial, population, { studyName: `${studyName} – B`, ...opts });

      const [orcA, orcB] = await Promise.all([
        simulationStore.create(configA),
        simulationStore.create(configB),
      ]);

      orcA.initialize().catch((e) => console.error(`⚠ AB-A init:`, e.message));
      orcB.initialize().catch((e) => console.error(`⚠ AB-B init:`, e.message));

      json(res, { idA: orcA.getId(), idB: orcB.getId(), populationSize: population.length });
    } catch (err: any) {
      json(res, { error: String(err.message ?? err) }, 400);
    }
    return;
  }

  // ── API: Porównanie segmentów — jedna kreacja, dwa segmenty ──────────────
  if (url.pathname === "/api/simulation/segment-compare" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const { ad, segmentA, segmentB, totalRounds = 5, platform = "facebook", activeAgentRatio = 0.7, studyName = "Porównanie segmentów" } = body;

      if (!ad?.headline && !ad?.creativeId) {
        json(res, { error: "Brak materiału reklamowego (headline lub kreacja)" }, 400); return;
      }
      if (!segmentA?.filter || !segmentB?.filter) {
        json(res, { error: "Wymagane filtry dla obu segmentów" }, 400); return;
      }

      const fullPop = await getCachedPersonas();
      const popA = filterPersonas(fullPop, segmentA.filter);
      const popB = filterPersonas(fullPop, segmentB.filter);

      if (popA.length < 30) {
        json(res, { error: `Segment A za mały po filtrowaniu (${popA.length} person, min 30)` }, 400); return;
      }
      if (popB.length < 30) {
        json(res, { error: `Segment B za mały po filtrowaniu (${popB.length} person, min 30)` }, 400); return;
      }

      const opts = {
        totalRounds: Math.min(Math.max(Number(totalRounds), 1), 20),
        platform: (platform ?? "facebook") as Platform,
        activeAgentRatio: Math.min(Math.max(Number(activeAgentRatio), 0.1), 1),
      };

      const labelA = segmentA.label ?? "Segment A";
      const labelB = segmentB.label ?? "Segment B";

      const configA = buildSimConfig(ad as AdMaterial, popA, { studyName: `${studyName} – ${labelA}`, ...opts });
      const configB = buildSimConfig(ad as AdMaterial, popB, { studyName: `${studyName} – ${labelB}`, ...opts });

      const [orcA, orcB] = await Promise.all([
        simulationStore.create(configA),
        simulationStore.create(configB),
      ]);

      orcA.initialize().catch((e) => console.error(`⚠ Seg-A init:`, e.message));
      orcB.initialize().catch((e) => console.error(`⚠ Seg-B init:`, e.message));

      json(res, { idA: orcA.getId(), idB: orcB.getId(), sizeA: popA.length, sizeB: popB.length });
    } catch (err: any) {
      json(res, { error: String(err.message ?? err) }, 400);
    }
    return;
  }

  // ── API: Analiza Bayesowska dla pary A/B ────────────────────────────────
  if (url.pathname === "/api/simulation/ab-bayesian" && req.method === "GET") {
    const idA = url.searchParams.get("idA");
    const idB = url.searchParams.get("idB");
    if (!idA || !idB) { json(res, { error: "Wymagane parametry: idA i idB" }, 400); return; }

    const orcA = simulationStore.get(idA);
    const orcB = simulationStore.get(idB);
    if (!orcA) { json(res, { error: `Symulacja A (${idA}) nie istnieje` }, 404); return; }
    if (!orcB) { json(res, { error: `Symulacja B (${idB}) nie istnieje` }, 404); return; }

    const stateA = orcA.getState();
    const stateB = orcB.getState();

    // Bayesian działa na zakończonych symulacjach; na running też — dane mogą być niepełne
    if (stateA.status === "initializing") {
      json(res, { error: "Symulacja A jeszcze się inicjalizuje" }, 202); return;
    }
    if (stateB.status === "initializing") {
      json(res, { error: "Symulacja B jeszcze się inicjalizuje" }, 202); return;
    }

    try {
      const result = computeBayesianAB(
        stateA.population,
        stateA.agentOpinions,
        stateB.agentOpinions,
      );
      json(res, result);
    } catch (err: any) {
      json(res, { error: String(err.message ?? err) }, 500);
    }
    return;
  }

  // ── API: Stan symulacji ───────────────────────────────────────────────────
  const simStateMatch = url.pathname.match(/^\/api\/simulation\/([^/]+)$/);
  if (simStateMatch && req.method === "GET") {
    const orc = simulationStore.get(simStateMatch[1]);
    if (!orc) { json(res, { error: "Symulacja nie istnieje" }, 404); return; }
    json(res, orc.getState());
    return;
  }

  // ── API: Stream rund (SSE) ────────────────────────────────────────────────
  const simStreamMatch = url.pathname.match(/^\/api\/simulation\/([^/]+)\/stream$/);
  if (simStreamMatch && req.method === "GET") {
    const orc = simulationStore.get(simStreamMatch[1]);
    if (!orc) { json(res, { error: "Symulacja nie istnieje" }, 404); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    });

    const sendEvent = (type: string, data: unknown) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const state = orc.getState();
    sendEvent("state", state);

    orc.onRoundComplete = (round) => {
      sendEvent("round", round);
      simulationStore.persist(orc.getId());
    };

    // Uruchom symulację jeśli jeszcze nie ruszyła
    if (state.status === "running" && state.currentRound < state.totalRounds) {
      orc.runToCompletion((current, total) => {
        sendEvent("progress", { current, total });
      }).then(() => {
        sendEvent("complete", orc.getState());
        simulationStore.persist(orc.getId());
        res.end();
      }).catch((err) => {
        sendEvent("error", { message: String(err.message ?? err) });
        res.end();
      });
    } else if (state.status === "complete") {
      sendEvent("complete", state);
      res.end();
    } else {
      // Initializing – czekaj
      const poll = setInterval(() => {
        const s = orc.getState();
        if (s.status === "running" && s.currentRound === 0) {
          orc.runToCompletion((current, total) => {
            sendEvent("progress", { current, total });
          }).then(() => {
            clearInterval(poll);
            sendEvent("complete", orc.getState());
            simulationStore.persist(orc.getId());
            res.end();
          }).catch((err) => {
            clearInterval(poll);
            sendEvent("error", { message: String(err.message ?? err) });
            res.end();
          });
          clearInterval(poll);
        } else if (s.status === "error" || s.status === "complete") {
          clearInterval(poll);
          sendEvent(s.status === "error" ? "error" : "complete", s);
          res.end();
        }
      }, 500);

      req.on("close", () => clearInterval(poll));
    }
    return;
  }

  // ── API: Wstrzyknij event ─────────────────────────────────────────────────
  const simInjectMatch = url.pathname.match(/^\/api\/simulation\/([^/]+)\/inject$/);
  if (simInjectMatch && req.method === "POST") {
    const orc = simulationStore.get(simInjectMatch[1]);
    if (!orc) { json(res, { error: "Symulacja nie istnieje" }, 404); return; }
    const body = JSON.parse(await readBody(req));
    const event = orc.injectEvent({
      injectedAt: orc.getState().currentRound + 1,
      type: (body.type ?? "breaking_news") as SimulationEventType,
      content: String(body.content ?? ""),
      affectedPersonaIds: Array.isArray(body.affectedPersonaIds) ? body.affectedPersonaIds : undefined,
    });
    json(res, event);
    return;
  }

  // ── API: Chat z agentem ───────────────────────────────────────────────────
  const simChatMatch = url.pathname.match(/^\/api\/simulation\/([^/]+)\/chat$/);
  if (simChatMatch && req.method === "POST") {
    const orc = simulationStore.get(simChatMatch[1]);
    if (!orc) { json(res, { error: "Symulacja nie istnieje" }, 404); return; }
    try {
      const body = JSON.parse(await readBody(req));
      const reply = await orc.chatWithAgent(body.personaId ?? null, String(body.message ?? ""));
      json(res, { reply });
    } catch (err: any) {
      json(res, { error: String(err.message ?? err) }, 500);
    }
    return;
  }

  // ── Static frontend (React build) ────────────────────────────────────────
  const FRONTEND_DIST = join(process.cwd(), "frontend", "dist");
  if (existsSync(FRONTEND_DIST)) {
    let filePath = join(FRONTEND_DIST, url.pathname === "/" ? "index.html" : url.pathname);
    // SPA fallback – wszystkie nieznane ścieżki → index.html
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(FRONTEND_DIST, "index.html");
    }
    const ext = filePath.split(".").pop() ?? "";
    const mime: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "application/javascript",
      css: "text/css",
      svg: "image/svg+xml",
      png: "image/png",
      ico: "image/x-icon",
      woff2: "font/woff2",
      json: "application/json",
    };
    // index.html nigdy nie keszujemy; pliki z hashem w nazwie — rok
    const isHashed = /\.[a-f0-9]{8,}\.\w+$/.test(filePath);
    const cacheControl = ext === "html"
      ? "no-cache, no-store, must-revalidate"
      : isHashed
        ? "public, max-age=31536000, immutable"
        : "no-cache";
    res.writeHead(200, {
      "Content-Type": mime[ext] ?? "application/octet-stream",
      "Cache-Control": cacheControl,
    });
    res.end(readFileSync(filePath));
    return;
  }

  res.writeHead(404); res.end();
  } catch (e: any) {
    console.error("[server] Unhandled error:", e);
    if (!res.headersSent) {
      json(res, { error: `Internal server error: ${e.message}` }, 500);
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n◆ We Are Legion`);
  console.log(`  http://localhost:${PORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn("  ⚠ Brak ANTHROPIC_API_KEY");
  fetchRelevantMarkets().then((m) => {
    if (m.length > 0) console.log(`  ◇ Polymarket: załadowano ${m.length} rynków`);
  }).catch(() => {});
});
