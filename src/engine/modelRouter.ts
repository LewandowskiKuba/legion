// ─────────────────────────────────────────────────────────────────────────────
// Model Router – wybiera LLM na podstawie profilu politycznego persony
//
// Composite political score:
//   score     = (traditionalism-50) - (collectivism-50) - (openness-50)*0.3
//   extremism = 100 - institutionalTrust
//
// Routing:
//   skrajna prawica  (score>25 & extremism>60) → Llama 4 Scout / Groq
//   prawica          (score>15)                 → Llama 3.3 70B / Groq
//   centrum+lewica   (domyślnie)                → Claude Sonnet / Anthropic
//   skrajna lewica   (score<-25 & extremism>60) → GPT-5.4-mini / OpenAI
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona } from "../personas/schema.js";

export type ModelProvider = "anthropic" | "openai" | "groq";

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  hasVision: boolean;  // czy model obsługuje obrazy
  label: string;       // do logowania
}

// Modele konfigurowalne przez env – łatwa zmiana bez rebuild
const MODEL_CENTER    = process.env.MODEL            ?? "claude-sonnet-4-6";
const MODEL_FAR_LEFT  = process.env.MODEL_FAR_LEFT   ?? "gpt-5.4-mini";
const MODEL_RIGHT     = process.env.MODEL_RIGHT      ?? "llama-3.3-70b-versatile";
const MODEL_FAR_RIGHT = process.env.MODEL_FAR_RIGHT  ?? "meta-llama/llama-4-scout-17b-16e-instruct";

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
