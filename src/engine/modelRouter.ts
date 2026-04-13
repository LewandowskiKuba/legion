// ─────────────────────────────────────────────────────────────────────────────
// Model Router – trzy tiery LLM + routing polityczny per persona
//
// TIER 1 — DEFAULT (bulk simulation rounds)
//   Composite political score:
//     score     = (traditionalism-50) - (collectivism-50) - (openness-50)*0.3
//     extremism = 100 - institutionalTrust
//   Routing:
//     skrajna prawica  (score>25 & extremism>60) → Llama 4 Scout / Groq
//     prawica          (score>15)                 → Llama 3.3 70B / Groq
//     centrum+lewica   (domyślnie)                → Claude Sonnet / Anthropic
//     skrajna lewica   (score<-25 & extremism>60) → GPT-5.4-mini / OpenAI
//
// TIER 2 — SMART (raporty, GraphRAG, synteza, ontologia)
//   Zawsze mocny model (domyślnie Claude Sonnet).
//   Konfigurowalny przez SMART_MODEL_NAME / SMART_PROVIDER / SMART_API_KEY.
//
// TIER 3 — NER (ekstrakcja encji, wysokovolumenowe mechaniczne zadania)
//   Szybki i tani (domyślnie Haiku / Groq).
//   Konfigurowalny przez NER_MODEL_NAME / NER_API_KEY / NER_BASE_URL.
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona } from "../personas/schema.js";

export type ModelProvider = "anthropic" | "openai" | "groq";

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  hasVision: boolean;  // czy model obsługuje obrazy
  label: string;       // do logowania
  apiKey?: string;     // override klucza API (dla custom endpoints)
  baseURL?: string;    // override base URL (np. self-hosted)
}

// ── Tier 1: Default (bulk / rundy symulacji) ──────────────────────────────
const MODEL_CENTER    = process.env.MODEL            ?? "claude-sonnet-4-6";
const MODEL_FAR_LEFT  = process.env.MODEL_FAR_LEFT   ?? "gpt-5.4-mini";
const MODEL_RIGHT     = process.env.MODEL_RIGHT      ?? "llama-3.3-70b-versatile";
const MODEL_FAR_RIGHT = process.env.MODEL_FAR_RIGHT  ?? "meta-llama/llama-4-scout-17b-16e-instruct";

// ── Tier 2: Smart (raporty, GraphRAG, ciężka synteza) ────────────────────
const SMART_MODEL_NAME = process.env.SMART_MODEL_NAME ?? "claude-sonnet-4-6";
const SMART_PROVIDER   = (process.env.SMART_PROVIDER ?? "anthropic") as ModelProvider;
const SMART_API_KEY    = process.env.SMART_API_KEY;      // undefined = użyj domyślnego
const SMART_BASE_URL   = process.env.SMART_BASE_URL;     // undefined = domyślny endpoint

// ── Tier 3: NER (ekstrakcja encji, tanie zadania mechaniczne) ────────────
const NER_MODEL_NAME = process.env.NER_MODEL_NAME ?? "llama-3.1-8b-instant";
const NER_PROVIDER   = (process.env.NER_PROVIDER ?? "groq") as ModelProvider;
const NER_API_KEY    = process.env.NER_API_KEY;
const NER_BASE_URL   = process.env.NER_BASE_URL;

function computePoliticalScore(persona: Persona): { score: number; extremism: number } {
  const ps = persona.psychographic;
  const t  = ps.traditionalism      ?? 50;
  const c  = ps.collectivism        ?? 50;
  const it = ps.institutionalTrust  ?? 50;
  const o  = ps.ocean?.openness     ?? 50;

  const score     = (t - 50) - (c - 50) - (o - 50) * 0.3;
  const extremism = 100 - it;

  return { score, extremism };
}

export function selectModel(persona: Persona): ModelConfig {
  const { score, extremism } = computePoliticalScore(persona);

  // Skrajna prawica – Llama 4 Scout (Groq): największy open-source, minimalny alignment
  if (score > 25 && extremism > 60) {
    return {
      provider: "groq",
      modelId: MODEL_FAR_RIGHT,
      hasVision: true,
      label: `Groq·${MODEL_FAR_RIGHT}`,
    };
  }

  // Prawica – Llama 3.3 70B (Groq): mniejszy RLHF niż Claude/GPT
  if (score > 15) {
    return {
      provider: "groq",
      modelId: MODEL_RIGHT,
      hasVision: false,  // Llama 3.3 70B nie obsługuje wizji
      label: `Groq·${MODEL_RIGHT}`,
    };
  }

  // Skrajna lewica – GPT-5.4-mini (OpenAI): profil SF, bardziej progresywny
  if (score < -25 && extremism > 60) {
    return {
      provider: "openai",
      modelId: MODEL_FAR_LEFT,
      hasVision: true,
      label: `OpenAI·${MODEL_FAR_LEFT}`,
    };
  }

  // Centrum + Lewica – Claude Sonnet (Anthropic): zbalansowany, dobry w polskim
  return {
    provider: "anthropic",
    modelId: MODEL_CENTER,
    hasVision: true,
    label: `Anthropic·${MODEL_CENTER}`,
  };
}

// Zwraca czytelny opis segmentu politycznego persony (do logów)
export function politicalSegmentLabel(persona: Persona): string {
  const { score, extremism } = computePoliticalScore(persona);
  if (score > 25 && extremism > 60) return "skrajna-prawica";
  if (score > 15)                   return "prawica";
  if (score < -25 && extremism > 60) return "skrajna-lewica";
  if (score < -15)                  return "lewica";
  return "centrum";
}

// ── Tier 2: Smart model ───────────────────────────────────────────────────
// Używany do: GraphRAG, reportAgent, SimulationTrajectory, ciężkiej syntezy
export function selectSmartModel(): ModelConfig {
  return {
    provider: SMART_PROVIDER,
    modelId: SMART_MODEL_NAME,
    hasVision: true,
    label: `Smart·${SMART_PROVIDER}·${SMART_MODEL_NAME}`,
    apiKey: SMART_API_KEY,
    baseURL: SMART_BASE_URL,
  };
}

// ── Tier 3: NER model ─────────────────────────────────────────────────────
// Używany do: ekstrakcji encji, tagowania, klasyfikacji — wysokovolumenowe,
// gdzie koszt per token ma znaczenie
export function selectNerModel(): ModelConfig {
  return {
    provider: NER_PROVIDER,
    modelId: NER_MODEL_NAME,
    hasVision: false,
    label: `NER·${NER_PROVIDER}·${NER_MODEL_NAME}`,
    apiKey: NER_API_KEY,
    baseURL: NER_BASE_URL,
  };
}
