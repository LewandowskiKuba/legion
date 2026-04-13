// ─────────────────────────────────────────────────────────────────────────────
// GraphRAG-lite – wyciąga encje i relacje z materiału reklamowego LUB scenariusza
// Używa Tier 2 (Smart Model) — konfigurowalny przez env, domyślnie Claude Sonnet
// Gdy materiał zawiera obraz, używa bezpośredniego klienta Anthropic z multimodal content.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { AdMaterial } from "../personas/schema.js";
import type { KnowledgeGraph, TopicSeed } from "./schema.js";
import { callSmartModel } from "../engine/runner.js";

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}

const GRAPHRAG_SYSTEM = `Jesteś analitykiem reklamy. Analizujesz materiały reklamowe i wyciągasz kluczowe informacje w formacie JSON. Odpowiadaj WYŁĄCZNIE poprawnym JSON, bez markdown ani komentarzy.`;

function buildGraphragPrompt(adText: string): string {
  return `Przeanalizuj poniższy materiał reklamowy i wyciągnij kluczowe informacje.

${adText}

Odpowiedz WYŁĄCZNIE w formacie JSON:
{
  "brand": "<nazwa marki>",
  "claims": ["<twierdzenie 1>", "<twierdzenie 2>", ...],
  "values": ["<wartość marki 1>", "<wartość marki 2>", ...],
  "competitors": ["<konkurent 1 jeśli wymieniony lub zasugerowany>"],
  "emotionalAnchors": ["<emocjonalny trigger 1>", ...],
  "controversialElements": ["<element który może wywołać kontrowersje lub opór>", ...]
}

Zasady:
- claims: konkretne obietnice/fakty z reklamy (max 5)
- values: wartości, które marka chce komunikować (max 4)
- competitors: tylko jeśli wyraźnie lub pośrednio wspomniani (może być [])
- emotionalAnchors: słowa/obrazy wywołujące emocje (max 4)
- controversialElements: elementy, które mogą polaryzować lub irytować (max 3, może być [])`;
}

function parseGraphragResponse(raw: string, ad: AdMaterial): KnowledgeGraph {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Brak JSON w odpowiedzi");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      brand: String(parsed.brand ?? ad.brandName ?? "nieznana"),
      claims: Array.isArray(parsed.claims) ? parsed.claims.map(String) : [],
      values: Array.isArray(parsed.values) ? parsed.values.map(String) : [],
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.map(String) : [],
      emotionalAnchors: Array.isArray(parsed.emotionalAnchors) ? parsed.emotionalAnchors.map(String) : [],
      controversialElements: Array.isArray(parsed.controversialElements) ? parsed.controversialElements.map(String) : [],
    };
  } catch {
    // Fallback: minimal KG from ad fields
    console.warn("⚠ GraphRAG: nie udało się sparsować JSON, używam fallbacku");
    return {
      brand: ad.brandName ?? "nieznana",
      claims: ad.headline ? [ad.headline] : [],
      values: [],
      competitors: [],
      emotionalAnchors: [],
      controversialElements: [],
    };
  }
}

export async function extractKnowledgeGraph(ad: AdMaterial): Promise<KnowledgeGraph> {
  const adText = [
    ad.headline ? `HEADLINE: ${ad.headline}` : null,
    ad.body ? `BODY: ${ad.body}` : null,
    ad.cta ? `CTA: ${ad.cta}` : null,
    ad.brandName ? `MARKA: ${ad.brandName}` : null,
    ad.productCategory ? `KATEGORIA: ${ad.productCategory}` : null,
    ad.context ? `KONTEKST: ${ad.context}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Gdy jest obraz — użyj bezpośredniego klienta Anthropic z multimodal content
  if (ad.imageBase64 && ad.imageMimeType) {
    const client = getAnthropicClient();
    const content: Anthropic.MessageParam["content"] = [];
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: ad.imageMimeType,
        data: ad.imageBase64,
      },
    });
    content.push({ type: "text", text: buildGraphragPrompt(adText) });

    const response = await client.messages.create({
      model: process.env.SMART_MODEL ?? "claude-sonnet-4-5",
      max_tokens: 800,
      system: GRAPHRAG_SYSTEM,
      messages: [{ role: "user", content }],
    });

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return parseGraphragResponse(raw, ad);
  }

  // Bez obrazu — użyj callSmartModel jak dotychczas
  const raw = await callSmartModel(
    GRAPHRAG_SYSTEM,
    buildGraphragPrompt(adText),
    800
  );

  return parseGraphragResponse(raw, ad);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wariant dla Topic Query – scenariusz bez reklamy
// Zamiast marki/twierdzeń → aktorzy/twierdzenia/grupy dotknięte zdarzeniem
// ─────────────────────────────────────────────────────────────────────────────

export async function extractKnowledgeGraphFromTopic(topic: TopicSeed): Promise<KnowledgeGraph> {
  const topicText = [
    `SCENARIUSZ: ${topic.query}`,
    topic.context ? `KONTEKST: ${topic.context}` : null,
    topic.expectedImpacts?.length
      ? `PRZEWIDYWANE SKUTKI: ${topic.expectedImpacts.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callSmartModel(
    `Jesteś analitykiem społecznym i ekonomicznym. Analizujesz scenariusze wydarzeń i wyciągasz kluczowe informacje do symulacji społecznej. Odpowiadaj WYŁĄCZNIE poprawnym JSON, bez markdown ani komentarzy.`,
    `Przeanalizuj poniższy scenariusz i wyciągnij kluczowe elementy do symulacji reakcji społecznej.

${topicText}

Odpowiedz WYŁĄCZNIE w formacie JSON:
{
  "brand": "<główny aktor/podmiot scenariusza (np. 'Iran', 'NBP', 'Rząd RP')>",
  "claims": ["<kluczowy fakt/twierdzenie 1>", "<fakt 2>", ...],
  "values": ["<wartość/interes którego dotyczy scenariusz>", ...],
  "competitors": ["<strony konfliktu lub konkurujące interesy>"],
  "emotionalAnchors": ["<emocjonalny trigger 1>", "<trigger 2>", ...],
  "controversialElements": ["<element polaryzujący opinię publiczną>", ...]
}

Zasady:
- brand: główny aktor/podmiot (kraj, instytucja, firma)
- claims: 3-5 konkretnych faktów/twierdzeń z scenariusza
- values: wartości/interesy których dotyczy zdarzenie (bezpieczeństwo, ceny, praca, itp.)
- competitors: strony konfliktu lub podmioty z przeciwstawnymi interesami (może być [])
- emotionalAnchors: słowa/tematy wywołujące silne emocje (max 4)
- controversialElements: aspekty które mogą polaryzować różne grupy społeczne (max 4)`,
    900
  );

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Brak JSON w odpowiedzi");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      brand: String(parsed.brand ?? topic.query.slice(0, 40)),
      claims: Array.isArray(parsed.claims) ? parsed.claims.map(String) : [],
      values: Array.isArray(parsed.values) ? parsed.values.map(String) : [],
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.map(String) : [],
      emotionalAnchors: Array.isArray(parsed.emotionalAnchors) ? parsed.emotionalAnchors.map(String) : [],
      controversialElements: Array.isArray(parsed.controversialElements) ? parsed.controversialElements.map(String) : [],
    };
  } catch {
    console.warn("⚠ GraphRAG (topic): nie udało się sparsować JSON, używam fallbacku");
    return {
      brand: topic.query.slice(0, 40),
      claims: [topic.query],
      values: [],
      competitors: [],
      emotionalAnchors: [],
      controversialElements: [],
    };
  }
}
