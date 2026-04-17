// ─────────────────────────────────────────────────────────────────────────────
// API client — łączy się z backendem na /api/*
// Proxy Vite → http://localhost:3000 (vite.config.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const BASE = "";

// ─── Typy (zgodne z mockApi.ts – nie zmieniamy UI) ───────────────────────────

export interface PopulationStats {
  total: number;
  averageAge: number;
  genderDistribution: { male: number; female: number };
  regions: { urban: number; suburban: number; rural: number };
  incomeDistribution: { low: number; medium: number; high: number };
  education: { basic: number; secondary: number; higher: number };
  politicalPreferences: { left: number; center: number; right: number };
  ageDistribution: { segment: string; value: number }[];
}

export interface Campaign {
  id: string;
  name: string;
  brand: string;
  date: string;
  attentionScore: number;
  resonance: number;
  purchaseIntentDelta: number;
  trustDelta: number;
}

export interface StudyResult {
  id: string;
  campaignName: string;
  date: string;
  metrics: {
    attention: number;
    resonance: number;
    purchaseIntentDelta: number;
    trustDelta: number;
    brandRecognitionScore: number;
  };
  segmentData: {
    age: Array<{ segment: string; attention: number; resonance: number; purchaseIntent: number }>;
    gender: Array<{ segment: string; attention: number; resonance: number; purchaseIntent: number }>;
    location: Array<{ segment: string; attention: number; resonance: number; purchaseIntent: number }>;
  };
  topRecall: string[];
  womQuotes: string[];
  rejectionSignals: string[];
  socialSpread?: {
    viralScore: number;
    chains: Array<{ depth: number; reach: number; engagement: number }>;
  };
  // Surowe dane z backendu (do PDF export / spread)
  _raw?: {
    reportA: any;
    reportB?: any;
    adA: any;
    responsesA: any[];
    population: any[];
    filterDesc?: string;
    studyName?: string;
  };
}

// ─── Mapowania ────────────────────────────────────────────────────────────────

function pct(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function mapPopulation(raw: any): PopulationStats {
  const total = raw.total as number;

  const male = raw.gender?.male ?? 0;
  const female = raw.gender?.female ?? 0;
  const gTotal = male + female || 1;

  const village = raw.settlement?.village ?? 0;
  const smallCity = raw.settlement?.small_city ?? 0;
  const mediumCity = raw.settlement?.medium_city ?? 0;
  const largeCity = raw.settlement?.large_city ?? 0;
  const metropolis = raw.settlement?.metropolis ?? 0;

  const below2k = raw.incomeLevel?.below_2000 ?? 0;
  const inc2k3k = raw.incomeLevel?.["2000_3500"] ?? 0;
  const inc3k5k = raw.incomeLevel?.["3500_5000"] ?? 0;
  const inc5k8k = raw.incomeLevel?.["5000_8000"] ?? 0;
  const above8k = raw.incomeLevel?.above_8000 ?? 0;

  const primary = raw.education?.primary ?? 0;
  const vocational = raw.education?.vocational ?? 0;
  const secondary = raw.education?.secondary ?? 0;
  const higher = raw.education?.higher ?? 0;

  const pis = raw.political?.pis ?? 0;
  const konfederacja = raw.political?.konfederacja ?? 0;
  const ko = raw.political?.ko ?? 0;
  const lewica = raw.political?.lewica ?? 0;
  const td = raw.political?.td ?? 0;
  const undecided = raw.political?.undecided ?? 0;

  return {
    total,
    averageAge: raw.avgAge ?? 0,
    genderDistribution: {
      male: pct(male, gTotal),
      female: pct(female, gTotal),
    },
    regions: {
      urban: pct(largeCity + metropolis, total),
      suburban: pct(mediumCity + smallCity, total),
      rural: pct(village, total),
    },
    incomeDistribution: {
      low: pct(below2k + inc2k3k, total),
      medium: pct(inc3k5k, total),
      high: pct(inc5k8k + above8k, total),
    },
    education: {
      basic: pct(primary + vocational, total),
      secondary: pct(secondary, total),
      higher: pct(higher, total),
    },
    politicalPreferences: {
      left: pct(ko + lewica, total),
      center: pct(td + undecided, total),
      right: pct(pis + konfederacja, total),
    },
    ageDistribution: Object.entries(raw.ageBrackets ?? {}).map(([segment, count]) => ({
      segment,
      value: pct(count as number, total),
    })),
  };
}

const SETTLEMENT_LABELS: Record<string, string> = {
  village: "Wieś",
  small_city: "Małe miasto",
  medium_city: "Miasto średnie",
  large_city: "Duże miasto",
  metropolis: "Metropolia",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Mężczyźni",
  female: "Kobiety",
};

function mapSegment(segs: Record<string, any>, labels: Record<string, string>) {
  return Object.entries(segs).map(([key, s]) => ({
    segment: labels[key] ?? s.label ?? key,
    attention: s.attentionScore ?? 0,
    resonance: s.resonanceScore ?? 0,
    purchaseIntent: s.purchaseIntentDelta ?? 0,
  }));
}

export function mapReportToStudyResult(raw: {
  reportA: any;
  reportB?: any;
  adA: any;
  responsesA: any[];
  population: any[];
  filterDesc?: string;
  studyName?: string;
  file?: string;
  ts?: string;
}): StudyResult {
  const { reportA, adA } = raw;
  const agg = reportA?.aggregate ?? {};

  const womQuotes = (reportA?.topWom ?? []).slice(0, 4).map((q: string) =>
    q.startsWith('"') ? q : `"${q}"`
  );

  // Parsuj ts z formatu "2026-03-23T13-27-13-302Z"
  const rawTs = raw.ts ?? raw.file ?? "";
  const isoTs = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/, "T$1:$2:$3.$4Z");
  const date = isoTs ? new Date(isoTs).toISOString() : new Date().toISOString();

  return {
    id: raw.file ?? `study-${Date.now()}`,
    campaignName: raw.studyName || (adA?.brandName
      ? `${adA.brandName} – ${adA.headline?.slice(0, 30) ?? "badanie"}`
      : adA?.headline?.slice(0, 40) ?? "Nowe badanie"),
    date,
    metrics: {
      attention: agg.attentionScore ?? 0,
      resonance: agg.resonanceScore ?? 0,
      purchaseIntentDelta: agg.purchaseIntentDelta ?? 0,
      trustDelta: agg.trustImpact ?? 0,
      brandRecognitionScore: agg.brandRecognitionScore ?? 0,
    },
    segmentData: {
      age: mapSegment(reportA?.byAgeGroup ?? {}, {}),
      gender: mapSegment(reportA?.byGender ?? {}, GENDER_LABELS),
      location: mapSegment(reportA?.bySettlement ?? {}, SETTLEMENT_LABELS),
    },
    topRecall: reportA?.topRecalls ?? [],
    womQuotes,
    rejectionSignals: reportA?.allRejections ?? [],
    _raw: { ...raw, studyName: raw.studyName },
  };
}

// ─── Funkcje API ──────────────────────────────────────────────────────────────

export async function getPopulation(): Promise<PopulationStats> {
  const res = await fetch(`${BASE}/api/population`);
  if (!res.ok) throw new Error("Błąd pobierania populacji");
  return mapPopulation(await res.json());
}

export async function getCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${BASE}/api/results`);
  if (!res.ok) return [];
  const results: any[] = await res.json();
  return results.map((r) => {
    const agg = r.reportA?.aggregate ?? {};
    const rawTs = r.ts ?? "";
    const isoTs = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/, "T$1:$2:$3.$4Z");
    return {
      id: r.file ?? r.ts,
      name: r.adA?.brandName
        ? `${r.adA.brandName} – ${(r.adA.headline ?? "").slice(0, 30)}`
        : (r.adA?.headline ?? "Badanie").slice(0, 40),
      brand: r.adA?.brandName ?? "–",
      date: isoTs ? new Date(isoTs).toISOString() : new Date().toISOString(),
      attentionScore: agg.attentionScore ?? 0,
      resonance: agg.resonanceScore ?? 0,
      purchaseIntentDelta: agg.purchaseIntentDelta ?? 0,
      trustDelta: agg.trustImpact ?? 0,
    };
  });
}

export async function getStudies(): Promise<StudyResult[]> {
  const res = await fetch(`${BASE}/api/results`);
  if (!res.ok) return [];
  const results: any[] = await res.json();
  return results.map(mapReportToStudyResult);
}

export async function getBrands(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/brands`);
  if (!res.ok) return [];
  const brands: any[] = await res.json();
  return brands.map((b) => b.brandName);
}

export const mockCategories = [
  "FMCG",
  "Elektronika",
  "Moda",
  "Usługi finansowe",
  "Motoryzacja",
  "Dostawa jedzenia",
  "Podróże",
  "Zdrowie",
  "Rozrywka",
  "AGD/RTV",
  "Uroda / Pielęgnacja",
];

export const mockContexts = [
  "Facebook Feed",
  "Instagram Stories",
  "YouTube Pre-roll",
  "TikTok In-Feed",
  "Desktop Display",
  "Mobile Banner",
  "LinkedIn Sponsored",
  "Pre-roll radio online",
];

// ─── Uruchamianie badania przez SSE ──────────────────────────────────────────

export interface StudyFormData {
  studyName?: string;
  headline: string;
  body: string;
  cta: string;
  brand?: string;
  category?: string;
  context?: string;
  creativeId?: string;            // ID tymczasowego pliku kreacji graficznej
  abMode?: boolean;
  headlineB?: string;
  bodyB?: string;
  ctaB?: string;
  brandB?: string;
  socialSpread?: boolean;
  filterGender?: string;
  filterAgeMin?: string;
  filterAgeMax?: string;
  filterSettlement?: string;
  filterIncome?: string;
}

// Fallback MIME detection by extension when file.type is empty
function guessMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
  return map[ext] ?? "";
}

// Resize + compress image to keep base64 payload under 60KB
// Iteratively lowers quality until target is met
function compressImage(file: File, maxPx = 768, targetBytes = 60_000): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      let quality = 0.75;
      let base64 = "";
      // Reduce quality until payload fits
      while (quality >= 0.3) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        base64 = dataUrl.split(",")[1];
        if (base64.length <= targetBytes) break;
        quality -= 0.1;
      }
      // Last resort: shrink canvas by 50%
      if (base64.length > targetBytes) {
        const c2 = document.createElement("canvas");
        c2.width = Math.round(w / 2);
        c2.height = Math.round(h / 2);
        c2.getContext("2d")!.drawImage(canvas, 0, 0, c2.width, c2.height);
        base64 = c2.toDataURL("image/jpeg", 0.7).split(",")[1];
      }

      resolve({ base64, mimeType: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function uploadCreative(file: File): Promise<string> {
  const { base64, mimeType } = await compressImage(file);

  const res = await fetch(`${BASE}/api/upload-creative`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType, filename: file.name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error ?? "Upload failed");
  }

  const { creativeId } = await res.json();
  return creativeId as string;
}

export async function runStudy(
  formData: StudyFormData,
  onProgress: (progress: number, label: string) => void,
  onComplete: (result: StudyResult) => void,
  onError: (msg: string) => void,
): Promise<() => void> {
  const params = new URLSearchParams({
    studyName: formData.studyName ?? "",
    headline: formData.headline,
    body: formData.body,
    cta: formData.cta,
    brandName: formData.brand ?? "",
    productCategory: formData.category ?? "",
    context: formData.context ?? "",
    ...(formData.creativeId ? { creativeId: formData.creativeId } : {}),
    ab: formData.abMode ? "1" : "0",
    headlineB: formData.headlineB ?? "",
    bodyB: formData.bodyB ?? "",
    ctaB: formData.ctaB ?? "",
    brandNameB: formData.brandB ?? "",
    filterGender: formData.filterGender ?? "all",
    filterAgeMin: formData.filterAgeMin ?? "0",
    filterAgeMax: formData.filterAgeMax ?? "99",
    filterSettlement: formData.filterSettlement ?? "all",
    filterIncome: formData.filterIncome ?? "all",
  });

  const es = new EventSource(`${BASE}/api/study?${params}`);

  es.addEventListener("progress", (e) => {
    const { done, total, phase } = JSON.parse(e.data);
    const pct = (done / total) * 100;
    const adjustedPct = formData.abMode
      ? pct / 2 + (phase === "B" ? 50 : 0)
      : pct;
    const label = phase
      ? `Wariant ${phase}: ${done}/${total} botów`
      : `${done}/${total} botów`;
    onProgress(adjustedPct, label);
  });

  es.addEventListener("result", (e) => {
    es.close();
    const raw = JSON.parse(e.data);
    const result = mapReportToStudyResult(raw);
    sessionStorage.setItem("currentStudy", JSON.stringify(result));
    onComplete(result);
  });

  es.addEventListener("error", (e: any) => {
    es.close();
    const msg = e.data ? JSON.parse(e.data).message : "Sprawdź terminal serwera";
    onError(msg);
  });

  return () => es.close();
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function exportPDF(result: StudyResult): Promise<void> {
  if (!result._raw) throw new Error("Brak danych do eksportu");
  const res = await fetch(`${BASE}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result._raw),
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "raport-sandbox.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Executive Summary ────────────────────────────────────────────────────────

export async function fetchSummary(result: StudyResult): Promise<string> {
  if (!result._raw) throw new Error("Brak danych do podsumowania");
  const res = await fetch(`${BASE}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportA: result._raw.reportA,
      reportB: result._raw.reportB,
      adA: result._raw.adA,
      filterDesc: result._raw.filterDesc,
    }),
  });
  if (!res.ok) throw new Error("Błąd generowania podsumowania");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.summary as string;
}

// ─── Simulation API (v2) ──────────────────────────────────────────────────────

export type SimulationSeedType = "ad" | "topic";

export interface AdSimulationFormData {
  seedType: "ad";
  studyName: string;
  headline?: string;       // opcjonalny gdy jest kreacja
  body?: string;
  cta?: string;
  brand?: string;
  category?: string;
  context?: string;
  creativeId?: string;
  totalRounds: number;
  platform: "facebook" | "twitter";
  activeAgentRatio?: number;
  abMode?: boolean;
  // targeting
  filterGender?: string;
  filterAgeMin?: string;
  filterAgeMax?: string;
  filterSettlement?: string;
  filterIncome?: string;
}

export interface RumorSimulationFormData {
  seedType: "rumor";
  studyName: string;
  headline?: string;       // tytuł/źródło komunikatu
  body: string;            // treść komunikatu/plotki (wymagane)
  brand?: string;          // opcjonalna marka/podmiot
  context?: string;
  creativeId?: string;
  totalRounds: number;
  platform: "facebook" | "twitter";
  activeAgentRatio?: number;
  filterGender?: string;
  filterAgeMin?: string;
  filterAgeMax?: string;
  filterSettlement?: string;
  filterIncome?: string;
}

export interface TopicSimulationFormData {
  seedType: "topic";
  studyName: string;
  query: string;
  context?: string;
  expectedImpacts?: string[];
  totalRounds: number;
  platform: "facebook" | "twitter";
  activeAgentRatio?: number;
}

export type SimulationFormData =
  | AdSimulationFormData
  | RumorSimulationFormData
  | TopicSimulationFormData;

export interface SimulationSummary {
  id: string;
  studyName: string;
  status: string;
  seedType: SimulationSeedType;
  createdAt: string;
  totalRounds: number;
  currentRound: number;
}

export async function listSimulations(): Promise<SimulationSummary[]> {
  const res = await fetch(`${BASE}/api/simulations`);
  if (!res.ok) return [];
  return res.json();
}

export async function startSimulation(data: SimulationFormData): Promise<string> {
  const bodyObj: any = {
    studyName: data.studyName,
    totalRounds: data.totalRounds,
    platform: data.platform,
    activeAgentRatio: data.activeAgentRatio ?? 0.7,
  };

  if (data.seedType === "ad") {
    bodyObj.seedType = "ad";
    bodyObj.creativeId = data.creativeId || undefined;
    bodyObj.filterGender = data.filterGender;
    bodyObj.filterAgeMin = data.filterAgeMin;
    bodyObj.filterAgeMax = data.filterAgeMax;
    bodyObj.filterSettlement = data.filterSettlement;
    bodyObj.filterIncome = data.filterIncome;
    bodyObj.ad = {
      headline: data.headline || "",
      body: data.body || "",
      cta: data.cta || "",
      brandName: data.brand || undefined,
      productCategory: data.category || undefined,
      context: data.context || undefined,
    };
  } else if (data.seedType === "rumor") {
    // Rumor is sent as seedType 'ad' to the backend, without CTA
    bodyObj.seedType = "ad";
    bodyObj.creativeId = data.creativeId || undefined;
    bodyObj.filterGender = data.filterGender;
    bodyObj.filterAgeMin = data.filterAgeMin;
    bodyObj.filterAgeMax = data.filterAgeMax;
    bodyObj.filterSettlement = data.filterSettlement;
    bodyObj.filterIncome = data.filterIncome;
    bodyObj.ad = {
      headline: data.headline || "",
      body: data.body,
      cta: "",
      brandName: data.brand || undefined,
      context: data.context || undefined,
    };
  } else {
    bodyObj.seedType = "topic";
    bodyObj.topic = {
      query: data.query,
      context: data.context || undefined,
      expectedImpacts: data.expectedImpacts?.length ? data.expectedImpacts : undefined,
    };
  }

  const res = await fetch(`${BASE}/api/simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Błąd startu symulacji" }));
    throw new Error(err.error ?? "Błąd startu symulacji");
  }
  const { simulationId } = await res.json();
  return simulationId as string;
}

// Stary helper — zostawiony dla kompatybilności, używaj startAbTest / startSegmentCompare
export async function startAbSimulation(
  dataA: AdSimulationFormData,
  dataB: AdSimulationFormData
): Promise<{ idA: string; idB: string }> {
  const [idA, idB] = await Promise.all([startSimulation(dataA), startSimulation(dataB)]);
  return { idA, idB };
}

// ─── Typy pomocnicze ─────────────────────────────────────────────────────────

export interface PopFilter {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  settlement?: string;
  income?: string;
}

export interface AbTestRequest {
  studyName?: string;
  adA: { headline?: string; body?: string; cta?: string; brand?: string; category?: string; context?: string; creativeId?: string };
  adB: { headline?: string; body?: string; cta?: string; brand?: string; category?: string; context?: string; creativeId?: string };
  filter?: PopFilter;
  totalRounds: number;
  platform: "facebook" | "twitter";
  activeAgentRatio?: number;
}

export interface SegmentCompareRequest {
  studyName?: string;
  ad: { headline?: string; body?: string; cta?: string; brand?: string; category?: string; context?: string; creativeId?: string };
  segmentA: { label: string; filter: PopFilter };
  segmentB: { label: string; filter: PopFilter };
  totalRounds: number;
  platform: "facebook" | "twitter";
  activeAgentRatio?: number;
}

// Test A/B: dwie kreacje, TA SAMA losowo dobrana populacja
export async function startAbTest(
  req: AbTestRequest
): Promise<{ idA: string; idB: string; populationSize: number }> {
  const res = await fetch(`${BASE}/api/simulation/ab`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Błąd startu testu A/B");
  }
  return res.json();
}

// Porównanie segmentów: jedna kreacja, DWA RÓŻNE segmenty demograficzne
export async function startSegmentCompare(
  req: SegmentCompareRequest
): Promise<{ idA: string; idB: string; sizeA: number; sizeB: number }> {
  const res = await fetch(`${BASE}/api/simulation/segment-compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Błąd startu porównania segmentów");
  }
  return res.json();
}

export async function getSimulation(id: string): Promise<any> {
  const res = await fetch(`${BASE}/api/simulation/${id}`);
  if (!res.ok) throw new Error("Symulacja nie istnieje");
  return res.json();
}

// ─── Bayesian A/B Analysis ────────────────────────────────────────────────────

export interface SegmentPosterior {
  label: string;
  key: string;
  n: number;
  posteriorA: number;
  posteriorB: number;
  margin: number;
  entropy: number;
  needsAB: boolean;
  winner: "A" | "B";
  avgOpinionA: number;
  avgOpinionB: number;
}

export interface DimensionResult {
  dimension: string;
  label: string;
  segments: SegmentPosterior[];
}

export interface BayesianABResult {
  globalPosteriorA: number;
  globalPosteriorB: number;
  globalMargin: number;
  globalWinner: "A" | "B" | "uncertain";
  globalNeedsAB: boolean;
  confidenceLevel: "high" | "moderate" | "low";
  totalPersonas: number;
  dimensions: DimensionResult[];
  priorityAB: Array<{
    dimension: string;
    dimensionLabel: string;
    label: string;
    entropy: number;
    margin: number;
    winner: "A" | "B";
    winnerPosterior: number;
    runnerUpPosterior: number;
    n: number;
  }>;
}

export async function getBayesianAB(idA: string, idB: string): Promise<BayesianABResult> {
  const res = await fetch(`${BASE}/api/simulation/ab-bayesian?idA=${idA}&idB=${idB}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Błąd analizy Bayesowskiej" }));
    throw new Error(err.error ?? "Błąd analizy");
  }
  return res.json();
}

export function streamSimulation(
  id: string,
  handlers: {
    onState?: (state: any) => void;
    onRound?: (round: any) => void;
    onProgress?: (current: number, total: number) => void;
    onComplete?: (state: any) => void;
    onError?: (msg: string) => void;
  }
): () => void {
  const es = new EventSource(`${BASE}/api/simulation/${id}/stream`);

  es.addEventListener("state", (e) => handlers.onState?.(JSON.parse(e.data)));
  es.addEventListener("round", (e) => handlers.onRound?.(JSON.parse(e.data)));
  es.addEventListener("progress", (e) => {
    const { current, total } = JSON.parse(e.data);
    handlers.onProgress?.(current, total);
  });
  es.addEventListener("complete", (e) => {
    es.close();
    handlers.onComplete?.(JSON.parse(e.data));
  });
  es.addEventListener("error", (e: any) => {
    es.close();
    const msg = e.data ? JSON.parse(e.data).message : "Błąd symulacji";
    handlers.onError?.(msg);
  });

  return () => es.close();
}

export async function injectSimulationEvent(
  id: string,
  type: string,
  content: string
): Promise<void> {
  await fetch(`${BASE}/api/simulation/${id}/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, content }),
  });
}

export async function chatWithSimulationAgent(
  id: string,
  personaId: string | null,
  message: string
): Promise<string> {
  const res = await fetch(`${BASE}/api/simulation/${id}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personaId, message }),
  });
  if (!res.ok) throw new Error("Błąd chatu z agentem");
  const { reply } = await res.json();
  return reply as string;
}

// ─── Social Spread ────────────────────────────────────────────────────────────

export async function runSpread(result: StudyResult): Promise<any> {
  if (!result._raw) throw new Error("Brak danych do spread simulation");
  const res = await fetch(`${BASE}/api/spread`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      responsesA: result._raw.responsesA,
      population: result._raw.population,
    }),
  });
  if (!res.ok) throw new Error("Błąd spread simulation");
  return res.json();
}
