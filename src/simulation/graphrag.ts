// ─────────────────────────────────────────────────────────────────────────────
// GraphRAG-lite – wyciąga encje i relacje z materiału reklamowego
// Używa Tier 2 (Smart Model) — konfigurowalny przez env, domyślnie Claude Sonnet
// ─────────────────────────────────────────────────────────────────────────────

import type { AdMaterial } from "../personas/schema.js";
import type { KnowledgeGraph } from "./schema.js";
import { callSmartModel } from "../engine/runner.js";

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

  const raw = await callSmartModel(
    `Jesteś analitykiem reklamy. Analizujesz materiały reklamowe i wyciągasz kluczowe informacje w formacie JSON. Odpowiadaj WYŁĄCZNIE poprawnym JSON, bez markdown ani komentarzy.`,
    `Przeanalizuj poniższy materiał reklamowy i wyciągnij kluczowe informacje.

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
    800
  );

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
