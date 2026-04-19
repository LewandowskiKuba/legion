// ─────────────────────────────────────────────────────────────────────────────
// Silnik LLM – równoległe wywołania z rate limitingiem, multi-model routing
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Persona, AdMaterial, BotResponse } from "../personas/schema.js";
import { buildSystemPrompt, buildUserPrompt, type SimulationContext } from "./prompt.js";
import { getPolymarketContext } from "../polymarket/index.js";
import { selectModel, selectSmartModel, selectNerModel, type ModelConfig, type ModelProvider } from "./modelRouter.js";

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "5", 10);
const MAX_RETRIES = 3;

// ─── Klienci – tworzone leniwie, tylko gdy potrzebne ─────────────────────────

const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let _openaiClient: OpenAI | null = null;
function getOpenAI(apiKey?: string, baseURL?: string): OpenAI {
  // Dla custom klucza/URL zawsze tworzymy nową instancję
  if (apiKey || baseURL) {
    return new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY ?? "",
      ...(baseURL ? { baseURL } : {}),
    });
  }
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error("Brak OPENAI_API_KEY w .env");
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiClient;
}

let _groqClient: OpenAI | null = null;
function getGroq(apiKey?: string, baseURL?: string): OpenAI {
  if (apiKey || baseURL) {
    return new OpenAI({
      apiKey: apiKey ?? process.env.GROQ_API_KEY ?? "",
      baseURL: baseURL ?? "https://api.groq.com/openai/v1",
    });
  }
  if (!_groqClient) {
    if (!process.env.GROQ_API_KEY) throw new Error("Brak GROQ_API_KEY w .env");
    _groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return _groqClient;
}

// Anthropic z opcjonalnym custom kluczem
function getAnthropicClient(apiKey?: string): Anthropic {
  if (apiKey && apiKey !== process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser odpowiedzi JSON z fallbackiem
// ─────────────────────────────────────────────────────────────────────────────

function parseResponse(personaId: string, raw: string): BotResponse {
  // Wyciągnij JSON nawet jeśli model dodał komentarze
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Brak JSON w odpowiedzi modelu");

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    personaId,
    attentionScore: clamp(Number(parsed.attentionScore ?? 0), 0, 10),
    resonanceScore: clamp(Number(parsed.resonanceScore ?? 0), 0, 10),
    purchaseIntentDelta: clamp(Number(parsed.purchaseIntentDelta ?? 0), -5, 5),
    trustImpact: clamp(Number(parsed.trustImpact ?? 0), -5, 5),
    brandRecognitionScore: clamp(Number(parsed.brandRecognitionScore ?? 0), 0, 10),
    recall: String(parsed.recall ?? ""),
    womSimulation: String(parsed.womSimulation ?? ""),
    rejectionSignals: Array.isArray(parsed.rejectionSignals)
      ? parsed.rejectionSignals.map(String)
      : [],
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-provider rate-limit tracking
// ─────────────────────────────────────────────────────────────────────────────

const rateLimitUntil: Record<ModelProvider, number> = {
  anthropic: 0,
  openai: 0,
  groq: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(provider: ModelProvider): Promise<void> {
  const wait = rateLimitUntil[provider] - Date.now();
  if (wait > 0) await sleep(wait);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wywołanie przez Anthropic SDK
// ─────────────────────────────────────────────────────────────────────────────

async function callAnthropic(
  persona: Persona,
  ad: AdMaterial,
  modelId: string,
  polyCtx = ""
): Promise<string> {
  const userContent: Anthropic.MessageParam["content"] =
    ad.imageBase64 && ad.imageMimeType
      ? [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: ad.imageMimeType,
              data: ad.imageBase64,
            },
          },
          { type: "text" as const, text: buildUserPrompt(ad) },
        ]
      : buildUserPrompt(ad);

  const message = await anthropicClient.messages.create({
    model: modelId,
    max_tokens: 512,
    temperature: 1.0,
    system: buildSystemPrompt(persona, undefined, polyCtx),
    messages: [{ role: "user", content: userContent }],
  });

  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Wywołanie przez OpenAI-compatible SDK (OpenAI + Groq)
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenAICompatible(
  client: OpenAI,
  persona: Persona,
  ad: AdMaterial,
  modelId: string,
  hasVision: boolean,
  polyCtx = ""
): Promise<string> {
  const systemMsg: OpenAI.ChatCompletionMessageParam = {
    role: "system",
    content: buildSystemPrompt(persona, undefined, polyCtx),
  };

  let userMsg: OpenAI.ChatCompletionMessageParam;

  if (hasVision && ad.imageBase64 && ad.imageMimeType) {
    userMsg = {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${ad.imageMimeType};base64,${ad.imageBase64}`,
          },
        },
        { type: "text", text: buildUserPrompt(ad) },
      ],
    };
  } else {
    userMsg = { role: "user", content: buildUserPrompt(ad) };
  }

  const completion = await client.chat.completions.create({
    model: modelId,
    max_tokens: 512,
    temperature: 1.0,
    messages: [systemMsg, userMsg],
  });

  return completion.choices[0]?.message?.content ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Generyczne wywołanie LLM z explicite podanym ModelConfig
// Używane przez Tier 2 (Smart) i Tier 3 (NER) — niezależne od profilu persony
// ─────────────────────────────────────────────────────────────────────────────

export async function callModelRaw(
  model: ModelConfig,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1024,
  attempt = 0
): Promise<string> {
  const { provider, modelId, apiKey, baseURL, label } = model;

  await waitForRateLimit(provider);

  try {
    let raw: string;
    if (provider === "anthropic") {
      const client = getAnthropicClient(apiKey);
      const message = await client.messages.create({
        model: modelId,
        max_tokens: maxTokens,
        temperature: 1.0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      raw = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } else {
      const client = provider === "openai" ? getOpenAI(apiKey, baseURL) : getGroq(apiKey, baseURL);
      const completion = await client.chat.completions.create({
        model: modelId,
        max_tokens: maxTokens,
        temperature: 1.0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }
    return raw;
  } catch (err: any) {
    if (err?.status === 429 || err?.type === "rate_limit_error" || err?.error?.type === "rate_limit_error") {
      const retryAfter = parseInt(err?.headers?.["retry-after"] ?? "0", 10);
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * 2 ** attempt, 60000);
      rateLimitUntil[provider] = Math.max(rateLimitUntil[provider], Date.now() + backoff);
      console.warn(`⚠ Rate limit [${label}] – czekam ${Math.round(backoff / 1000)}s (attempt ${attempt + 1})`);
      if (attempt < MAX_RETRIES) {
        await sleep(backoff);
        return callModelRaw(model, systemPrompt, userPrompt, maxTokens, attempt + 1);
      }
    }
    if (attempt < MAX_RETRIES) {
      await sleep(1000 * (attempt + 1));
      return callModelRaw(model, systemPrompt, userPrompt, maxTokens, attempt + 1);
    }
    throw err;
  }
}

// Shorthand dla Tier 2 (Smart)
export async function callSmartModel(systemPrompt: string, userPrompt: string, maxTokens = 1024): Promise<string> {
  return callModelRaw(selectSmartModel(), systemPrompt, userPrompt, maxTokens);
}

// Shorthand dla Tier 3 (NER)
export async function callNerModel(systemPrompt: string, userPrompt: string, maxTokens = 256): Promise<string> {
  return callModelRaw(selectNerModel(), systemPrompt, userPrompt, maxTokens);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generyczne wywołanie LLM dla jednej persony (z retry + rate limiting)
// ─────────────────────────────────────────────────────────────────────────────

export async function callPersonaRaw(
  persona: Persona,
  systemPrompt: string,
  userPrompt: string,
  attempt = 0
): Promise<string> {
  const model = selectModel(persona);
  const { provider, modelId, hasVision, apiKey, baseURL, label } = model;

  await waitForRateLimit(provider);

  try {
    let raw: string;
    if (provider === "anthropic") {
      const message = await anthropicClient.messages.create({
        model: modelId,
        max_tokens: 512,
        temperature: 1.0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      raw = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } else {
      const client = provider === "openai" ? getOpenAI(apiKey, baseURL) : getGroq(apiKey, baseURL);
      const completion = await client.chat.completions.create({
        model: modelId,
        max_tokens: 512,
        temperature: 1.0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }
    return raw;
  } catch (err: any) {
    if (err?.status === 429 || err?.type === "rate_limit_error" || err?.error?.type === "rate_limit_error") {
      const retryAfter = parseInt(err?.headers?.["retry-after"] ?? err?.response?.headers?.get?.("retry-after") ?? "0", 10);
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * 2 ** attempt, 60000);
      rateLimitUntil[provider] = Math.max(rateLimitUntil[provider], Date.now() + backoff);
      console.warn(`⚠ Rate limit [${label}] – czekam ${Math.round(backoff / 1000)}s (attempt ${attempt + 1})`);
      if (attempt < MAX_RETRIES) {
        await sleep(backoff);
        return callPersonaRaw(persona, systemPrompt, userPrompt, attempt + 1);
      }
    }
    if (attempt < MAX_RETRIES) {
      await sleep(1000 * (attempt + 1));
      return callPersonaRaw(persona, systemPrompt, userPrompt, attempt + 1);
    }
    throw err;
  }
}

// Worker pool dla generycznych zadań
export async function runPersonaBatch<T>(
  population: Persona[],
  promptBuilder: (persona: Persona) => { systemPrompt: string; userPrompt: string },
  responseParser: (personaId: string, raw: string) => T,
  onProgress?: (done: number, total: number) => void
): Promise<T[]> {
  const total = population.length;
  const results: T[] = new Array(total);
  let nextIdx = 0;
  let doneCount = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) return;
      const persona = population[idx];
      const { systemPrompt, userPrompt } = promptBuilder(persona);
      try {
        const raw = await callPersonaRaw(persona, systemPrompt, userPrompt);
        results[idx] = responseParser(persona.id, raw);
      } catch (err) {
        console.error(`✗ Błąd persona ${persona.name} (${persona.id}):`, (err as Error).message ?? err);
        results[idx] = responseParser(persona.id, "{}");
      }
      doneCount++;
      onProgress?.(doneCount, total);
    }
  }

  const poolSize = Math.min(CONCURRENCY, total);
  await Promise.all(Array.from({ length: poolSize }, worker));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pojedyncze wywołanie dla jednej persony (z retry + rate limiting)
// ─────────────────────────────────────────────────────────────────────────────

async function queryPersona(
  persona: Persona,
  ad: AdMaterial,
  polyCtx = "",
  attempt = 0
): Promise<BotResponse> {
  const model = selectModel(persona);
  const { provider, modelId, hasVision, label } = model;

  await waitForRateLimit(provider);

  try {
    let raw: string;

    if (provider === "anthropic") {
      raw = await callAnthropic(persona, ad, modelId, polyCtx);
    } else if (provider === "openai") {
      raw = await callOpenAICompatible(getOpenAI(), persona, ad, modelId, hasVision, polyCtx);
    } else {
      // groq
      raw = await callOpenAICompatible(getGroq(), persona, ad, modelId, hasVision, polyCtx);
    }

    return parseResponse(persona.id, raw);
  } catch (err: any) {
    // Rate limit (429) – wstrzymaj workery dla tego providera
    if (err?.status === 429 || err?.type === "rate_limit_error" || err?.error?.type === "rate_limit_error") {
      const retryAfter = parseInt(err?.headers?.["retry-after"] ?? err?.response?.headers?.get?.("retry-after") ?? "0", 10);
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * 2 ** attempt, 60000);
      rateLimitUntil[provider] = Math.max(rateLimitUntil[provider], Date.now() + backoff);
      console.warn(`⚠ Rate limit [${label}] – czekam ${Math.round(backoff / 1000)}s (attempt ${attempt + 1})`);
      if (attempt < MAX_RETRIES) {
        await sleep(backoff);
        return queryPersona(persona, ad, polyCtx, attempt + 1);
      }
    }

    if (attempt < MAX_RETRIES) {
      // Inne błędy – krótki backoff
      await sleep(1000 * (attempt + 1));
      return queryPersona(persona, ad, polyCtx, attempt + 1);
    }

    console.error(`✗ Błąd [${label}] persona ${persona.name} (${persona.id}):`, (err as Error).message ?? err);
    return {
      personaId: persona.id,
      attentionScore: 0,
      resonanceScore: 0,
      purchaseIntentDelta: 0,
      trustImpact: 0,
      brandRecognitionScore: 0,
      recall: "",
      womSimulation: "",
      rejectionSignals: ["ERROR: nie udało się uzyskać odpowiedzi"],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker pool – CONCURRENCY workerów działa zawsze, nie czeka na najwolniejszego
// ─────────────────────────────────────────────────────────────────────────────

export async function runStudy(
  population: Persona[],
  ad: AdMaterial,
  onProgress?: (done: number, total: number) => void
): Promise<BotResponse[]> {
  const total = population.length;
  const results: BotResponse[] = new Array(total);
  let nextIdx = 0;
  let doneCount = 0;
  const polyCtx = await getPolymarketContext();

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) return;
      results[idx] = await queryPersona(population[idx], ad, polyCtx);
      doneCount++;
      onProgress?.(doneCount, total);
    }
  }

  const poolSize = Math.min(CONCURRENCY, total);
  await Promise.all(Array.from({ length: poolSize }, worker));

  return results;
}
