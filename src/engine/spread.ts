// ─────────────────────────────────────────────────────────────────────────────
// Social Spread Simulation
// Modeluje propagację przekazu reklamowego przez sieć społeczną:
// Seed (top spreader z badania) → Hop 1 (3 osoby) → Hop 2 (te co willShare)
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { Persona, BotResponse } from "../personas/schema.js";
import { buildSystemPrompt } from "./prompt.js";

const MODEL = process.env.MODEL ?? "claude-sonnet-4-6";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface SpreadNode {
  personaId: string;
  personaName: string;
  hop: number;
  receivedMessage: string;
  willShare: boolean;
  shareMessage: string;
  sentiment: -1 | 0 | 1;
}

export interface SpreadChain {
  seedPersonaId: string;
  seedPersonaName: string;
  seedWOM: string;
  nodes: SpreadNode[];
}

export interface SpreadReport {
  viralScore: number;        // 0–100
  totalReached: number;
  positiveReach: number;
  negativeReach: number;
  neutralReach: number;
  shareRate: number;         // % osób które dalej przekazały
  chains: SpreadChain[];
  messageEvolution: { hop: number; messages: string[] }[];
}

async function querySpread(
  persona: Persona,
  senderName: string,
  message: string,
  hop: number,
): Promise<SpreadNode> {
  const userPrompt = `Twój znajomy/znajoma ${senderName} właśnie powiedział/a Ci:
„${message}"

Reagujesz zgodnie ze swoim profilem. Odpowiedz WYŁĄCZNIE w formacie JSON:
{
  "willShare": <true jeśli chciałbyś/chciałabyś powiedzieć to dalej innym znajomym>,
  "shareMessage": "<co dokładnie powiedziałbyś/powiedziałabyś dalej – potocznym językiem, jedno zdanie; pusty string jeśli willShare=false>",
  "sentiment": <-1 negatywny, 0 neutralny, 1 pozytywny stosunek do tej informacji>
}`;

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 1.1,
      system: buildSystemPrompt(persona),
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Brak JSON");
    const parsed = JSON.parse(jsonMatch[0]);
    const sentiment = ([-1, 0, 1] as const).includes(Number(parsed.sentiment) as -1 | 0 | 1)
      ? (Number(parsed.sentiment) as -1 | 0 | 1)
      : 0;

    return {
      personaId: persona.id,
      personaName: persona.name,
      hop,
      receivedMessage: message,
      willShare: Boolean(parsed.willShare),
      shareMessage: String(parsed.shareMessage ?? ""),
      sentiment,
    };
  } catch {
    return {
      personaId: persona.id,
      personaName: persona.name,
      hop,
      receivedMessage: message,
      willShare: false,
      shareMessage: "",
      sentiment: 0,
    };
  }
}

export async function runSpreadSimulation(
  population: Persona[],
  responses: BotResponse[],
  onProgress?: (done: number, total: number) => void,
): Promise<SpreadReport> {
  const personaMap = new Map(population.map((p) => [p.id, p]));

  // Top spreaderów: najwyższy attention + WOM (bez twardego progu – adaptuje się do populacji)
  const minSpreaders = Math.max(1, Math.min(5, Math.floor(responses.length * 0.2)));
  const spreaders = [...responses]
    .filter((r) => r.womSimulation.trim())
    .sort((a, b) => (b.attentionScore + b.purchaseIntentDelta) - (a.attentionScore + a.purchaseIntentDelta))
    .slice(0, minSpreaders);

  const spreaderIds = new Set(spreaders.map((s) => s.personaId));
  const pool = population.filter((p) => !spreaderIds.has(p.id));

  const chains: SpreadChain[] = [];
  let done = 0;
  const estimated = spreaders.length * 4; // ~3 hop1 + ~1 hop2

  for (const spreader of spreaders) {
    const seed = personaMap.get(spreader.personaId);
    if (!seed) continue;

    const chain: SpreadChain = {
      seedPersonaId: seed.id,
      seedPersonaName: seed.name,
      seedWOM: spreader.womSimulation,
      nodes: [],
    };

    // Hop 1 – 3 losowe persony słyszą od seedu
    const hop1Personas = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
    const hop1Results = await Promise.all(
      hop1Personas.map((p) => querySpread(p, seed.name, spreader.womSimulation, 1))
    );
    chain.nodes.push(...hop1Results);
    done += hop1Results.length;
    onProgress?.(done, estimated);

    // Hop 2 – te które willShare przekazują dalej (max 2)
    const hop2Seeds = hop1Results.filter((n) => n.willShare && n.shareMessage).slice(0, 2);
    const hop1Ids = new Set(hop1Personas.map((p) => p.id));

    for (const hop2Seed of hop2Seeds) {
      const recipient = [...pool]
        .filter((p) => !hop1Ids.has(p.id))
        .sort(() => Math.random() - 0.5)[0];
      if (!recipient) continue;

      const node = await querySpread(recipient, hop2Seed.personaName, hop2Seed.shareMessage, 2);
      chain.nodes.push(node);
      done++;
      onProgress?.(done, estimated);
    }

    chains.push(chain);
  }

  // Agregacja
  const allNodes = chains.flatMap((c) => c.nodes);
  const positiveReach = allNodes.filter((n) => n.sentiment === 1).length;
  const negativeReach = allNodes.filter((n) => n.sentiment === -1).length;
  const neutralReach = allNodes.filter((n) => n.sentiment === 0).length;
  const sharers = allNodes.filter((n) => n.willShare).length;
  const shareRate = allNodes.length > 0 ? Math.round((sharers / allNodes.length) * 100) : 0;

  // Viral score: share rate × sentiment premium
  const sentimentPremium = allNodes.length > 0 ? (positiveReach - negativeReach) / allNodes.length : 0;
  const viralScore = Math.round(Math.min(100, Math.max(0, shareRate * (1 + sentimentPremium * 0.5))));

  const messageEvolution: { hop: number; messages: string[] }[] = [];
  for (let hop = 0; hop <= 2; hop++) {
    const msgs = hop === 0
      ? chains.slice(0, 3).map((c) => c.seedWOM)
      : allNodes.filter((n) => n.hop === hop && n.shareMessage).map((n) => n.shareMessage).slice(0, 3);
    if (msgs.length > 0) messageEvolution.push({ hop, messages: msgs });
  }

  return {
    viralScore,
    totalReached: allNodes.length,
    positiveReach,
    negativeReach,
    neutralReach,
    shareRate,
    chains,
    messageEvolution,
  };
}
