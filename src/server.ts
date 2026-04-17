// ─────────────────────────────────────────────────────────────────────────────
// Serwer HTTP – formularz + A/B + segment targeting + social spread + deep dive
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { generatePopulation } from "./personas/generator.js";
import { runStudy, callSmartModel } from "./engine/runner.js";
import { runSpreadSimulation } from "./engine/spread.js";
import { aggregateResults, type StudyReport } from "./reports/aggregator.js";
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
  const size = parseInt(process.env.POPULATION_SIZE ?? "50", 10);
  const pop = generatePopulation(size);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(POPULATION_PATH, JSON.stringify(pop, null, 2), "utf8");
  return pop;
}

function filterPopulation(population: Persona[], p: URLSearchParams): Persona[] {
  let pop = population;
  const gender = p.get("filterGender");
  const ageMin = parseInt(p.get("filterAgeMin") ?? "0");
  const ageMax = parseInt(p.get("filterAgeMax") ?? "99");
  const settlement = p.get("filterSettlement");
  const income = p.get("filterIncome");

  if (gender && gender !== "all") pop = pop.filter((x) => x.demographic.gender === gender);
  if (!isNaN(ageMin) && ageMin > 0) pop = pop.filter((x) => x.demographic.age >= ageMin);
  if (!isNaN(ageMax) && ageMax < 99) pop = pop.filter((x) => x.demographic.age <= ageMax);
  if (settlement && settlement !== "all") pop = pop.filter((x) => x.demographic.settlementType === settlement);
  if (income && income !== "all") pop = pop.filter((x) => x.financial.incomeLevel === income);

  return pop.length >= 5 ? pop : population; // fallback jeśli filtr za restrykcyjny
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function adFromParams(p: URLSearchParams, prefix = ""): AdMaterial {
  return {
    headline: p.get(prefix + "headline") ?? "",
    body: p.get(prefix + "body") ?? "",
    cta: p.get(prefix + "cta") ?? "",
    brandName: p.get(prefix + "brandName") || undefined,
    productCategory: (p.get(prefix + "productCategory") || undefined) as AdMaterial["productCategory"],
    context: p.get(prefix + "context") || undefined,
  };
}

function loadCreativeAsset(creativeId: string): Pick<AdMaterial, "imageBase64" | "imageMimeType"> | null {
  const ALLOWED_TYPES: Record<string, AdMaterial["imageMimeType"]> = {
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", gif: "image/gif", webp: "image/webp",
  };
  for (const [ext, mime] of Object.entries(ALLOWED_TYPES)) {
    const filePath = join(TEMP_DIR, `${creativeId}.${ext}`);
    if (existsSync(filePath)) {
      return {
        imageBase64: readFileSync(filePath).toString("base64"),
        imageMimeType: mime,
      };
    }
  }
  return null;
}

function deleteCreativeAsset(creativeId: string): void {
  const exts = ["jpg", "jpeg", "png", "gif", "webp"];
  for (const ext of exts) {
    const filePath = join(TEMP_DIR, `${creativeId}.${ext}`);
    if (existsSync(filePath)) { try { unlinkSync(filePath); } catch {} }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = `
  <option value="">-- dowolna --</option>
  <option value="fmcg">FMCG</option>
  <option value="electronics">Elektronika</option>
  <option value="fashion">Moda</option>
  <option value="financial_services">Usługi finansowe</option>
  <option value="automotive">Motoryzacja</option>
  <option value="food_delivery">Dostawa jedzenia</option>
  <option value="travel">Podróże</option>
  <option value="healthcare">Zdrowie</option>
  <option value="entertainment">Rozrywka</option>
  <option value="home_appliances">AGD/RTV</option>
  <option value="beauty">Uroda / Pielęgnacja</option>`;

const HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>We Are Legion</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f0f11; color: #e4e4e7; min-height: 100vh; padding: 2rem; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.8rem; color: #a1a1aa; margin-bottom: 0.4rem; }
    input, textarea, select { width: 100%; background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; color: #e4e4e7; padding: 0.6rem 0.75rem; font-size: 0.9rem; margin-bottom: 1rem; outline: none; transition: border-color 0.15s; }
    input:focus, textarea:focus, select:focus { border-color: #6366f1; }
    textarea { resize: vertical; min-height: 90px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
    .ab-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 640px) { .ab-grid, .row, .row3 { grid-template-columns: 1fr; } }
    .ab-label { font-size: 0.75rem; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; }
    .ab-label.b { color: #f59e0b; }
    button { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: 0.7rem 1.5rem; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #4f46e5; }
    button:disabled { background: #3f3f46; cursor: not-allowed; }
    .btn-outline { background: transparent; border: 1px solid #3f3f46; color: #a1a1aa; margin-left: 0.75rem; }
    .btn-outline:hover { border-color: #6366f1; color: #e4e4e7; background: transparent; }
    .btn-pdf { background: #166534; }
    .btn-pdf:hover { background: #15803d; }
    .btn-spread { background: #7c3aed; }
    .btn-spread:hover { background: #6d28d9; }
    .toggle-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .toggle-item { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem; color: #a1a1aa; }
    .toggle-item input { width: auto; margin: 0; accent-color: #6366f1; }
    #abSection { display: none; }
    #filterSection { display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #27272a; }
    .progress-bar-wrap { background: #27272a; border-radius: 99px; height: 6px; margin: 0.75rem 0; overflow: hidden; }
    .progress-bar { background: #6366f1; height: 100%; border-radius: 99px; width: 0%; transition: width 0.3s; }
    .progress-label { font-size: 0.8rem; color: #71717a; }
    #progress, #results { display: none; }
    .section-title { font-size: 0.75rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; margin: 1.25rem 0 0.75rem; font-weight: 600; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
    @media (max-width: 600px) { .metric-grid { grid-template-columns: repeat(2, 1fr); } }
    .metric { background: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 1rem; text-align: center; }
    .metric-value { font-size: 1.75rem; font-weight: 700; color: #6366f1; }
    .metric-label { font-size: 0.7rem; color: #71717a; margin-top: 0.2rem; }
    .segment-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .segment-table th { text-align: left; color: #71717a; padding: 0.4rem 0.6rem; border-bottom: 1px solid #27272a; }
    .segment-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #18181b; }
    .segment-table tr.clickable { cursor: pointer; }
    .segment-table tr.clickable:hover td { background: #1f1f23; }
    .tag { display: inline-block; background: #27272a; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.75rem; margin: 0.2rem; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    .neutral { color: #a1a1aa; }
    .chart-wrap { position: relative; height: 220px; margin: 1rem 0; }
    .ab-winner { display: inline-block; background: #14532d; color: #86efac; border-radius: 6px; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 600; margin-left: 0.5rem; }
    /* Spread */
    .spread-chain { border: 1px solid #27272a; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
    .spread-seed { font-weight: 600; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .spread-nodes { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .spread-node { background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.8rem; max-width: 220px; }
    .spread-node.pos { border-color: #166534; }
    .spread-node.neg { border-color: #7f1d1d; }
    .spread-node.hop2 { opacity: 0.8; }
    .spread-arrow { color: #52525b; align-self: center; font-size: 1.2rem; }
    .viral-score { font-size: 3rem; font-weight: 800; color: #7c3aed; }
    /* Modal deep dive */
    .modal-backdrop { display: none; position: fixed; inset: 0; background: #000000bb; z-index: 100; overflow-y: auto; padding: 2rem; }
    .modal-backdrop.open { display: block; }
    .modal { background: #18181b; border: 1px solid #27272a; border-radius: 16px; max-width: 720px; margin: 0 auto; padding: 2rem; }
    .modal-close { float: right; background: none; border: none; color: #71717a; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1; }
    .modal-close:hover { color: #e4e4e7; background: none; }
    .persona-card { border: 1px solid #27272a; border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem; background: #09090b; }
    .persona-name { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem; }
    .persona-meta { font-size: 0.75rem; color: #71717a; margin-bottom: 0.5rem; }
    .persona-scores { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.5rem; margin-bottom: 0.5rem; }
    .persona-score { text-align: center; background: #18181b; border-radius: 6px; padding: 0.4rem; font-size: 0.75rem; }
    .persona-score strong { display: block; font-size: 1.1rem; color: #6366f1; }
    .persona-wom { font-size: 0.8rem; font-style: italic; color: #a1a1aa; border-left: 2px solid #3f3f46; padding-left: 0.5rem; margin: 0.4rem 0; }
    .persona-rejections { font-size: 0.75rem; color: #ef4444; }
    .filter-badge { display: inline-block; background: #1e1b4b; color: #818cf8; border-radius: 4px; padding: 0.15rem 0.5rem; font-size: 0.72rem; margin-left: 0.5rem; }
  </style>
</head>
<body>
  <h1>We Are Legion</h1>
  <p class="subtitle">Pre-test komunikacji reklamowej na syntetycznej populacji polskich konsumentów</p>

  <div class="card">
    <div class="toggle-row">
      <label class="toggle-item">
        <input type="checkbox" id="abToggle"> Tryb A/B
      </label>
      <label class="toggle-item">
        <input type="checkbox" id="filterToggle"> Segment targeting
      </label>
      <label class="toggle-item">
        <input type="checkbox" id="spreadToggle"> Social spread
      </label>
    </div>

    <form id="studyForm">
      <!-- Segment targeting -->
      <div id="filterSection">
        <div class="section-title" style="margin-top:0">Filtruj populację</div>
        <div class="row3">
          <div>
            <label>Płeć</label>
            <select name="filterGender">
              <option value="all">Wszyscy</option>
              <option value="male">Mężczyźni</option>
              <option value="female">Kobiety</option>
            </select>
          </div>
          <div>
            <label>Wiek od</label>
            <input type="number" name="filterAgeMin" min="18" max="80" placeholder="18">
          </div>
          <div>
            <label>Wiek do</label>
            <input type="number" name="filterAgeMax" min="18" max="80" placeholder="80">
          </div>
        </div>
        <div class="row">
          <div>
            <label>Typ miejscowości</label>
            <select name="filterSettlement">
              <option value="all">Wszystkie</option>
              <option value="village">Wieś</option>
              <option value="small_city">Małe miasto</option>
              <option value="medium_city">Miasto średnie</option>
              <option value="large_city">Duże miasto</option>
              <option value="metropolis">Metropolia</option>
            </select>
          </div>
          <div>
            <label>Dochód netto</label>
            <select name="filterIncome">
              <option value="all">Wszystkie</option>
              <option value="below_2000">Poniżej 2 000 zł</option>
              <option value="2000_3500">2 000–3 500 zł</option>
              <option value="3500_5000">3 500–5 000 zł</option>
              <option value="5000_8000">5 000–8 000 zł</option>
              <option value="above_8000">Powyżej 8 000 zł</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Warianty reklam -->
      <div class="ab-grid">
        <div>
          <div class="ab-label" id="labelA">Reklama</div>
          <label>Headline *</label>
          <input type="text" name="headline" required placeholder="Nagłówek reklamy">
          <label>Body *</label>
          <textarea name="body" required placeholder="Treść reklamy..."></textarea>
          <label>CTA *</label>
          <input type="text" name="cta" required placeholder="Wezwanie do działania">
          <div class="row">
            <div><label>Marka</label><input type="text" name="brandName" placeholder="np. Nike"></div>
            <div><label>Kategoria</label><select name="productCategory">${CATEGORY_OPTIONS}</select></div>
          </div>
          <label>Kontekst ekspozycji</label>
          <input type="text" name="context" placeholder="np. Pre-roll YouTube">
        </div>
        <div id="abSection">
          <div class="ab-label b">Wariant B</div>
          <label>Headline</label>
          <input type="text" name="headlineB" placeholder="Nagłówek wariantu B">
          <label>Body</label>
          <textarea name="bodyB" placeholder="Treść wariantu B..."></textarea>
          <label>CTA</label>
          <input type="text" name="ctaB" placeholder="CTA wariantu B">
          <div class="row">
            <div><label>Marka</label><input type="text" name="brandNameB" placeholder="np. Nike"></div>
            <div><label>Kategoria</label><select name="productCategoryB">${CATEGORY_OPTIONS}</select></div>
          </div>
          <label>Kontekst ekspozycji</label>
          <input type="text" name="contextB" placeholder="np. Baner display">
        </div>
      </div>

      <div style="margin-top:1rem">
        <button type="submit" id="submitBtn">Uruchom badanie</button>
      </div>
    </form>
  </div>

  <div id="progress">
    <div class="card">
      <div class="progress-label" id="progressLabel">Inicjalizacja...</div>
      <div class="progress-bar-wrap"><div class="progress-bar" id="progressBar"></div></div>
    </div>
  </div>

  <div id="results">
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <span class="section-title" style="margin:0">Wyniki <span id="filterBadge" class="filter-badge" style="display:none"></span></span>
        <div>
          <button class="btn-pdf" id="pdfBtn" onclick="downloadPDF()">Pobierz PDF</button>
          <button class="btn-spread btn-outline" id="spreadBtn" style="display:none" onclick="runSpread()">Uruchom Social Spread</button>
        </div>
      </div>

      <div class="section-title" id="aggregateTitle">Wyniki agregat</div>
      <div class="metric-grid" id="metricGrid"></div>
      <div class="chart-wrap"><canvas id="radarChart"></canvas></div>

      <div class="section-title">Segmentacja wiekowa <span style="font-size:.7rem;color:#52525b">(kliknij wiersz → deep dive)</span></div>
      <table class="segment-table" id="ageTable"><thead></thead><tbody></tbody></table>
      <div class="chart-wrap"><canvas id="ageChart"></canvas></div>

      <div class="section-title">Segmentacja płci</div>
      <table class="segment-table" id="genderTable"><thead></thead><tbody></tbody></table>

      <div class="section-title">Segmentacja typ miejscowości</div>
      <table class="segment-table" id="settlementTable"><thead></thead><tbody></tbody></table>

      <div class="section-title">Co zapamiętali (top recall)</div>
      <div id="recallList"></div>

      <div class="section-title">Co powiedzieliby znajomemu (WOM)</div>
      <div id="womList"></div>

      <div class="section-title">Sygnały odrzucenia</div>
      <div id="rejectionList"></div>
    </div>

    <!-- Social Spread -->
    <div class="card" id="spreadResults" style="display:none">
      <div class="section-title" style="margin-top:0">Social Spread Simulation</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.25rem" id="spreadMetrics"></div>
      <div class="section-title">Ewolucja przekazu</div>
      <div id="spreadEvolution"></div>
      <div class="section-title">Łańcuchy propagacji</div>
      <div id="spreadChains"></div>
    </div>
  </div>

  <!-- Deep Dive Modal -->
  <div class="modal-backdrop" id="modalBackdrop" onclick="closeModal(event)">
    <div class="modal">
      <button class="modal-close" onclick="document.getElementById('modalBackdrop').classList.remove('open')">✕</button>
      <div style="font-weight:600;font-size:1rem;margin-bottom:1rem" id="modalTitle"></div>
      <div id="modalContent"></div>
    </div>
  </div>

  <script>
    let lastResult = null;
    let allResponses = [];
    let allPopulation = [];
    let isAB = false;
    let spreadRunning = false;

    document.getElementById('abToggle').addEventListener('change', function() {
      isAB = this.checked;
      document.getElementById('abSection').style.display = isAB ? 'block' : 'none';
      document.getElementById('labelA').textContent = isAB ? 'Wariant A' : 'Reklama';
    });

    document.getElementById('filterToggle').addEventListener('change', function() {
      document.getElementById('filterSection').style.display = this.checked ? 'block' : 'none';
    });

    document.getElementById('studyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      document.getElementById('progress').style.display = 'block';
      document.getElementById('results').style.display = 'none';
      document.getElementById('spreadResults').style.display = 'none';
      setProgress(0, 'Uruchamianie badania...');

      const params = new URLSearchParams({
        headline: data.headline, body: data.body, cta: data.cta,
        brandName: data.brandName || '', productCategory: data.productCategory || '', context: data.context || '',
        ab: isAB ? '1' : '0',
        headlineB: data.headlineB || '', bodyB: data.bodyB || '', ctaB: data.ctaB || '',
        brandNameB: data.brandNameB || '', productCategoryB: data.productCategoryB || '', contextB: data.contextB || '',
        filterGender: data.filterGender || 'all',
        filterAgeMin: data.filterAgeMin || '0',
        filterAgeMax: data.filterAgeMax || '99',
        filterSettlement: data.filterSettlement || 'all',
        filterIncome: data.filterIncome || 'all',
      });

      const es = new EventSource('/api/study?' + params);

      es.addEventListener('progress', (e) => {
        const { done, total, phase } = JSON.parse(e.data);
        const pct = done / total * 100;
        setProgress(isAB ? pct / 2 + (phase === 'B' ? 50 : 0) : pct,
          phase ? \`Wariant \${phase}: \${done}/\${total} botów\` : \`\${done}/\${total} botów\`);
      });

      es.addEventListener('result', (e) => {
        es.close();
        submitBtn.disabled = false;
        lastResult = JSON.parse(e.data);
        allResponses = lastResult.responsesA || [];
        allPopulation = lastResult.population || [];
        renderResults(lastResult);
        setProgress(100, 'Badanie zakończone ✓');
        const showSpread = document.getElementById('spreadToggle').checked;
        if (showSpread) {
          document.getElementById('spreadBtn').style.display = 'inline-block';
        }
      });

      es.addEventListener('error', (e) => {
        es.close();
        submitBtn.disabled = false;
        setProgress(0, 'Błąd: ' + (e.data ? JSON.parse(e.data).message : 'sprawdź terminal serwera'));
      });
    });

    async function runSpread() {
      if (spreadRunning || !lastResult) return;
      spreadRunning = true;
      const btn = document.getElementById('spreadBtn');
      btn.disabled = true;
      btn.textContent = 'Symulacja...';
      setProgress(0, 'Social Spread: łączenie węzłów...');
      document.getElementById('progress').style.display = 'block';

      try {
        const res = await fetch('/api/spread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responsesA: lastResult.responsesA, population: lastResult.population }),
        });
        const spread = await res.json();
        renderSpread(spread);
        setProgress(100, 'Social Spread ukończony ✓');
      } catch (err) {
        setProgress(0, 'Błąd spread: ' + err.message);
      } finally {
        spreadRunning = false;
        btn.disabled = false;
        btn.textContent = 'Uruchom ponownie';
      }
    }

    function setProgress(pct, label) {
      document.getElementById('progressBar').style.width = pct + '%';
      document.getElementById('progressLabel').textContent = label;
    }

    function cd(val) {
      const v = Number(val);
      const sign = v > 0 ? '+' : '';
      const cls = v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
      return \`<span class="\${cls}">\${sign}\${v}</span>\`;
    }

    let radarChart, ageChart;

    function renderResults(data) {
      document.getElementById('results').style.display = 'block';
      const { reportA, reportB } = data;
      const isABResult = !!reportB;
      document.getElementById('aggregateTitle').textContent = isABResult ? 'Wyniki agregat – A/B' : 'Wyniki agregat';

      // Filter badge
      const badge = document.getElementById('filterBadge');
      if (data.filterDesc) { badge.textContent = data.filterDesc; badge.style.display = 'inline'; }
      else badge.style.display = 'none';

      const a = reportA.aggregate;
      const b = reportB?.aggregate;
      const metrics = [
        { label: 'Attention', valA: a.attentionScore, valB: b?.attentionScore, suffix: '/10' },
        { label: 'Resonance', valA: a.resonanceScore, valB: b?.resonanceScore, suffix: '/10' },
        { label: 'Purchase Intent Δ', valA: a.purchaseIntentDelta, valB: b?.purchaseIntentDelta, delta: true },
        { label: 'Trust Impact Δ', valA: a.trustImpact, valB: b?.trustImpact, delta: true },
      ];
      document.getElementById('metricGrid').innerHTML = metrics.map(m => {
        const winner = isABResult && m.valB !== undefined && m.valA !== m.valB
          ? (m.valB > m.valA ? '<span class="ab-winner">B wygrywa</span>' : '<span class="ab-winner" style="background:#1e3a5f;color:#93c5fd">A wygrywa</span>')
          : '';
        const valA = m.delta ? cd(m.valA) : \`<span style="color:#6366f1">\${m.valA}\${m.suffix??''}</span>\`;
        const valB = m.valB !== undefined ? (m.delta ? cd(m.valB) : \`<span style="color:#f59e0b">\${m.valB}\${m.suffix??''}</span>\`) : '';
        return \`<div class="metric"><div class="metric-value">\${valA}\${isABResult?\` / \${valB}\`:\''}</div><div class="metric-label">\${m.label}\${winner}</div></div>\`;
      }).join('');

      renderRadar(reportA, reportB);

      const thead = isABResult
        ? '<tr><th>Segment</th><th>n</th><th>ATT A→B</th><th>RES A→B</th><th>PI Δ A→B</th><th>TR Δ A→B</th></tr>'
        : '<tr><th>Segment</th><th>n</th><th>Attention</th><th>Resonance</th><th>Purchase Δ</th><th>Trust Δ</th></tr>';

      fillSegmentTable('ageTable', thead, reportA.byAgeGroup, reportB?.byAgeGroup, 'age');
      renderAgeChart(reportA, reportB);
      fillSegmentTable('genderTable', thead, reportA.byGender, reportB?.byGender, 'gender');
      fillSegmentTable('settlementTable', thead, reportA.bySettlement, reportB?.bySettlement, 'settlement');

      document.getElementById('recallList').innerHTML =
        reportA.topRecalls.map(r => \`<span class="tag">\${r}</span>\`).join('') +
        (reportB ? '<br><span style="color:#f59e0b;font-size:.75rem">B: </span>' + reportB.topRecalls.map(r => \`<span class="tag" style="border-color:#78350f">\${r}</span>\`).join('') : '');

      document.getElementById('womList').innerHTML =
        reportA.topWom.slice(0,3).map(r => \`<div style="margin-bottom:.4rem;font-size:.875rem">„\${r}"</div>\`).join('');

      document.getElementById('rejectionList').innerHTML =
        reportA.allRejections.map(r => \`<span class="tag" style="color:#ef4444">\${r}</span>\`).join('') +
        (reportB?.allRejections.length ? '<br><span style="color:#f59e0b;font-size:.75rem">B: </span>' + reportB.allRejections.map(r => \`<span class="tag" style="color:#f59e0b">\${r}</span>\`).join('') : '');
    }

    function fillSegmentTable(id, thead, segsA, segsB, dimKey) {
      document.querySelector('#' + id + ' thead').innerHTML = thead;
      const isABt = !!segsB;
      document.querySelector('#' + id + ' tbody').innerHTML = Object.entries(segsA).map(([k, s]) => {
        const b = segsB?.[k];
        const row = isABt && b
          ? \`<tr class="clickable" onclick="openDeepDive('\${dimKey}','\${k}')">
              <td>\${s.label}</td><td>\${s.count}</td>
              <td>\${s.attentionScore} → \${b.attentionScore}</td>
              <td>\${s.resonanceScore} → \${b.resonanceScore}</td>
              <td>\${cd(s.purchaseIntentDelta)} → \${cd(b.purchaseIntentDelta)}</td>
              <td>\${cd(s.trustImpact)} → \${cd(b.trustImpact)}</td>
            </tr>\`
          : \`<tr class="clickable" onclick="openDeepDive('\${dimKey}','\${k}')">
              <td>\${s.label}</td><td>\${s.count}</td>
              <td>\${s.attentionScore}</td><td>\${s.resonanceScore}</td>
              <td>\${cd(s.purchaseIntentDelta)}</td><td>\${cd(s.trustImpact)}</td>
            </tr>\`;
        return row;
      }).join('');
    }

    function renderRadar(repA, repB) {
      if (radarChart) radarChart.destroy();
      const a = repA.aggregate;
      const norm = (v, mn, mx) => ((v - mn) / (mx - mn)) * 10;
      const ds = [{ label: repB ? 'Wariant A' : 'Wyniki', data: [a.attentionScore, a.resonanceScore, norm(a.purchaseIntentDelta,-5,5), norm(a.trustImpact,-5,5)], borderColor: '#6366f1', backgroundColor: '#6366f130', pointBackgroundColor: '#6366f1' }];
      if (repB) { const b = repB.aggregate; ds.push({ label: 'Wariant B', data: [b.attentionScore, b.resonanceScore, norm(b.purchaseIntentDelta,-5,5), norm(b.trustImpact,-5,5)], borderColor: '#f59e0b', backgroundColor: '#f59e0b20', pointBackgroundColor: '#f59e0b' }); }
      radarChart = new Chart(document.getElementById('radarChart'), { type: 'radar', data: { labels: ['Attention','Resonance','Purchase Intent','Trust'], datasets: ds }, options: { scales: { r: { min: 0, max: 10, ticks: { color: '#52525b', stepSize: 2 }, grid: { color: '#27272a' }, pointLabels: { color: '#a1a1aa', font: { size: 11 } } } }, plugins: { legend: { labels: { color: '#a1a1aa' } } } } });
    }

    function renderAgeChart(repA, repB) {
      if (ageChart) ageChart.destroy();
      const labels = Object.values(repA.byAgeGroup).map(s => s.label);
      const ds = [{ label: repB ? 'Attention A' : 'Attention', data: Object.values(repA.byAgeGroup).map(s => s.attentionScore), backgroundColor: '#6366f1aa', borderRadius: 4 }];
      if (repB) ds.push({ label: 'Attention B', data: Object.values(repB.byAgeGroup).map(s => s.attentionScore), backgroundColor: '#f59e0baa', borderRadius: 4 });
      ageChart = new Chart(document.getElementById('ageChart'), { type: 'bar', data: { labels, datasets: ds }, options: { scales: { y: { min: 0, max: 10, grid: { color: '#27272a' }, ticks: { color: '#71717a' } }, x: { grid: { color: '#27272a' }, ticks: { color: '#71717a' } } }, plugins: { legend: { labels: { color: '#a1a1aa' } } } } });
    }

    // ── Deep Dive ──────────────────────────────────────────────────────────────
    function openDeepDive(dim, key) {
      if (!allResponses.length || !allPopulation.length) return;
      const popMap = Object.fromEntries(allPopulation.map(p => [p.id, p]));
      const LABELS = { village: 'wieś', small_city: 'małe miasto', medium_city: 'miasto średnie', large_city: 'duże miasto', metropolis: 'metropolia', male: 'mężczyzna', female: 'kobieta' };
      const INCOME = { below_2000: '<2k', '2000_3500': '2–3.5k', '3500_5000': '3.5–5k', '5000_8000': '5–8k', above_8000: '>8k' };

      function matchesDim(p) {
        if (dim === 'age') {
          const g = key;
          const a = p.demographic.age;
          if (g === '18–24') return a < 25;
          if (g === '25–34') return a >= 25 && a < 35;
          if (g === '35–44') return a >= 35 && a < 45;
          if (g === '45–54') return a >= 45 && a < 55;
          if (g === '55–64') return a >= 55 && a < 65;
          if (g === '65+') return a >= 65;
        }
        if (dim === 'gender') return p.demographic.gender === key;
        if (dim === 'settlement') return p.demographic.settlementType === key;
        return true;
      }

      const filtered = allResponses
        .map(r => ({ r, p: popMap[r.personaId] }))
        .filter(({ p }) => p && matchesDim(p))
        .sort((a, b) => b.r.attentionScore - a.r.attentionScore);

      document.getElementById('modalTitle').textContent = \`Deep Dive: \${LABELS[key] ?? key} (n=\${filtered.length})\`;
      document.getElementById('modalContent').innerHTML = filtered.map(({ r, p }) => {
        const rejHtml = r.rejectionSignals.length
          ? \`<div class="persona-rejections">⚠ \${r.rejectionSignals.join(' · ')}</div>\`
          : '';
        return \`<div class="persona-card">
          <div class="persona-name">\${p.name}, \${p.demographic.age} lat</div>
          <div class="persona-meta">\${LABELS[p.demographic.gender]} · \${LABELS[p.demographic.settlementType]} · \${p.demographic.education} · \${INCOME[p.financial.incomeLevel]} PLN</div>
          <div class="persona-scores">
            <div class="persona-score"><strong>\${r.attentionScore}</strong>Attention</div>
            <div class="persona-score"><strong>\${r.resonanceScore}</strong>Resonance</div>
            <div class="persona-score"><strong \${r.purchaseIntentDelta>0?'style="color:#22c55e"':r.purchaseIntentDelta<0?'style="color:#ef4444"':''}>\${r.purchaseIntentDelta>0?'+':''}\${r.purchaseIntentDelta}</strong>Purchase</div>
            <div class="persona-score"><strong \${r.trustImpact>0?'style="color:#22c55e"':r.trustImpact<0?'style="color:#ef4444"':''}>\${r.trustImpact>0?'+':''}\${r.trustImpact}</strong>Trust</div>
          </div>
          \${r.recall ? \`<div style="font-size:.8rem;color:#a1a1aa;margin-bottom:.3rem">📌 \${r.recall}</div>\` : ''}
          \${r.womSimulation ? \`<div class="persona-wom">„\${r.womSimulation}"</div>\` : ''}
          \${rejHtml}
        </div>\`;
      }).join('');

      document.getElementById('modalBackdrop').classList.add('open');
    }

    function closeModal(e) {
      if (e.target === document.getElementById('modalBackdrop')) {
        document.getElementById('modalBackdrop').classList.remove('open');
      }
    }

    // ── Social Spread render ───────────────────────────────────────────────────
    function renderSpread(s) {
      document.getElementById('spreadResults').style.display = 'block';
      const sentColor = (n) => n.sentiment === 1 ? '#22c55e' : n.sentiment === -1 ? '#ef4444' : '#a1a1aa';
      const sentLabel = (n) => n.sentiment === 1 ? '😊' : n.sentiment === -1 ? '😠' : '😐';

      document.getElementById('spreadMetrics').innerHTML = [
        { label: 'Viral Score', value: s.viralScore + '/100', color: '#7c3aed' },
        { label: 'Zasięg', value: s.totalReached + ' osób', color: '#6366f1' },
        { label: 'Share Rate', value: s.shareRate + '%', color: '#0ea5e9' },
        { label: 'Pozytywny zasięg', value: s.positiveReach + ' / ' + s.negativeReach + ' neg', color: '#22c55e' },
      ].map(m => \`<div class="metric"><div class="metric-value" style="color:\${m.color};font-size:1.4rem">\${m.value}</div><div class="metric-label">\${m.label}</div></div>\`).join('');

      document.getElementById('spreadEvolution').innerHTML = s.messageEvolution.map(e => \`
        <div style="margin-bottom:.75rem">
          <div style="font-size:.72rem;color:#52525b;text-transform:uppercase;margin-bottom:.3rem">Hop \${e.hop} \${e.hop===0?'(oryginalne WOM)':e.hop===1?'(po 1 podaniu)':'(po 2 podaniach)'}</div>
          \${e.messages.map(m => \`<div style="font-size:.82rem;color:#a1a1aa;border-left:2px solid #3f3f46;padding-left:.5rem;margin-bottom:.25rem">„\${m}"</div>\`).join('')}
        </div>
      \`).join('');

      document.getElementById('spreadChains').innerHTML = s.chains.map(chain => \`
        <div class="spread-chain">
          <div class="spread-seed">🎯 \${chain.seedPersonaName} <span style="font-weight:400;font-size:.8rem;color:#a1a1aa">→ seed</span></div>
          <div style="font-size:.8rem;font-style:italic;color:#71717a;margin-bottom:.5rem">„\${chain.seedWOM}"</div>
          <div class="spread-nodes">
            \${chain.nodes.filter(n=>n.hop===1).map(n => \`
              <div class="spread-node \${n.sentiment===1?'pos':n.sentiment===-1?'neg':''}">
                <div style="font-weight:500">\${sentLabel(n)} \${n.personaName}</div>
                <div style="font-size:.72rem;color:\${sentColor(n)}">\${n.willShare ? '↗ przekaże dalej' : '✗ nie przekaże'}</div>
                \${n.shareMessage ? \`<div style="font-size:.72rem;color:#a1a1aa;margin-top:.25rem">„\${n.shareMessage.slice(0,80)}\${n.shareMessage.length>80?'…':''}"</div>\` : ''}
                \${chain.nodes.filter(n2=>n2.hop===2 && n2.receivedMessage===n.shareMessage).map(n2=>\`
                  <div style="margin-top:.35rem;padding-top:.35rem;border-top:1px solid #27272a;font-size:.72rem">
                    <span style="color:#52525b">↪ </span>\${sentLabel(n2)} \${n2.personaName}
                    <span style="color:\${sentColor(n2)}"> (\${n2.willShare?'przekaże':'stop'})</span>
                  </div>
                \`).join('')}
              </div>
            \`).join('<div class="spread-arrow">→</div>')}
          </div>
        </div>
      \`).join('');
      document.getElementById('spreadResults').scrollIntoView({ behavior: 'smooth' });
    }

    async function downloadPDF() {
      if (!lastResult) return;
      const btn = document.getElementById('pdfBtn');
      btn.disabled = true; btn.textContent = 'Generuję...';
      const res = await fetch('/api/export-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastResult) });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'raport-sandbox.pdf'; a.click();
      URL.revokeObjectURL(url);
      btn.disabled = false; btn.textContent = 'Pobierz PDF';
    }
  </script>
</body>
</html>`;

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
    };
    json(res, stats);
    return;
  }

  // ── API: Regeneruj populację agentów ──────────────────────────────────────
  if (url.pathname === "/api/population/regenerate" && req.method === "POST") {
    try {
      const body = await readBody(req).then(JSON.parse).catch(() => ({}));
      const size = Math.min(Math.max(Number(body.size ?? process.env.POPULATION_SIZE ?? 100), 10), 500);
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

  if (url.pathname === "/api/study" && req.method === "GET") {
    if (!process.env.ANTHROPIC_API_KEY) { res.writeHead(500, CORS_HEADERS); res.end(); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...CORS_HEADERS,
    });

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const creativeId = url.searchParams.get("creativeId") || undefined;
    const studyName = url.searchParams.get("studyName") ?? "";
    try {
      const fullPopulation = getPopulation();
      const population = filterPopulation(fullPopulation, url.searchParams);
      const adA = adFromParams(url.searchParams);
      if (creativeId) Object.assign(adA, loadCreativeAsset(creativeId) ?? {});
      const isAB = url.searchParams.get("ab") === "1";

      // Opis filtra dla UI
      const filterParts: string[] = [];
      const fg = url.searchParams.get("filterGender");
      const fs = url.searchParams.get("filterSettlement");
      const fi = url.searchParams.get("filterIncome");
      const fam = url.searchParams.get("filterAgeMin");
      const fax = url.searchParams.get("filterAgeMax");
      if (fg && fg !== "all") filterParts.push(fg === "male" ? "mężczyźni" : "kobiety");
      if (fam && parseInt(fam) > 0) filterParts.push(`≥${fam}`);
      if (fax && parseInt(fax) < 99) filterParts.push(`≤${fax}`);
      if (fs && fs !== "all") filterParts.push(fs.replace("_", " "));
      if (fi && fi !== "all") filterParts.push(fi.replace("_", "–") + " PLN");
      const filterDesc = filterParts.length > 0 ? `${filterParts.join(", ")} (n=${population.length})` : undefined;

      const responsesA = await runStudy(population, adA, (done, total) =>
        send("progress", { done, total, phase: isAB ? "A" : undefined })
      );
      const reportA = aggregateResults(population, responsesA);

      let reportB: StudyReport | undefined;
      let responsesB: BotResponse[] | undefined;
      if (isAB) {
        const adBFixed: AdMaterial = {
          headline: url.searchParams.get("headlineB") ?? "",
          body: url.searchParams.get("bodyB") ?? "",
          cta: url.searchParams.get("ctaB") ?? "",
          brandName: url.searchParams.get("brandNameB") || undefined,
          productCategory: (url.searchParams.get("productCategoryB") || undefined) as AdMaterial["productCategory"],
          context: url.searchParams.get("contextB") || undefined,
        };
        responsesB = await runStudy(population, adBFixed, (done, total) =>
          send("progress", { done, total, phase: "B" })
        );
        reportB = aggregateResults(population, responsesB);

        mkdirSync(RESULTS_DIR, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        writeFileSync(join(RESULTS_DIR, `report_ab_${ts}.json`),
          JSON.stringify({ studyName, adA, reportA, reportB }, null, 2), "utf8");

        send("result", { studyName, reportA, reportB, adA, responsesA, population, filterDesc });
      } else {
        mkdirSync(RESULTS_DIR, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        writeFileSync(join(RESULTS_DIR, `report_${ts}.json`),
          JSON.stringify({ studyName, adA, reportA, responsesA }, null, 2), "utf8");

        send("result", { studyName, reportA, adA, responsesA, population, filterDesc });
      }
    } catch (err) {
      send("error", { message: String(err) });
    } finally {
      if (creativeId) deleteCreativeAsset(creativeId);
      res.end();
    }
    return;
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
