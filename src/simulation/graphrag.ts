// ─────────────────────────────────────────────────────────────────────────────
// GraphRAG-lite – wyciąga encje i relacje z materiału reklamowego
// Pojedyncze wywołanie LLM do Claude (zawsze Anthropic, niezależnie od routingu)
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { AdMaterial } from "../personas/schema.js";
import type { KnowledgeGraph } from "./schema.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_MODEL = "claude-sonnet-4-6";

export async function extractKnowledgeGraph(ad: AdMaterial): Promise<KnowledgeGraph> {
  const adText = [
    `HEADLINE: ${ad.headline}`,
    `BODY: ${ad.body}`,
    `CTA: ${ad.cta}`,
    ad.brandName ? `MARKA: ${ad.brandName}` : null,
    ad.productCategory ? `KATEGORIA: ${ad.productCategory}` : null,
    ad.context ? `KONTEKST: ${ad.context}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await client.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 800,
    temperature: 0,
    system: `Jesteś analitykiem reklamy. Analizujesz materiały reklamowe i wyciągasz kluczowe informacje w formacie JSON. Odpowiadaj WYŁĄCZNIE poprawnym JSON, bez markdown ani komentarzy.`,
    messages: [
      {
        role: "user",
        content: `Przeanalizuj poniższy materiał reklamowy i wyciągnij kluczowe informacje.

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
- controversialElements: elementy, które mogą polaryzować lub irytować (max 3, może być [])`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

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
      claims: [ad.headline],
      values: [],
      competitors: [],
      emotionalAnchors: [],
      controversialElements: [],
    };
  }
}
