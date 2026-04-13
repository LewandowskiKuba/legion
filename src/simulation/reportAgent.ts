// ─────────────────────────────────────────────────────────────────────────────
// Report Agent – LLM-powered synteza wyników symulacji
// ─────────────────────────────────────────────────────────────────────────────

import type { SimulationState, SimulationInsights, Coalition, InfluencerPersona } from "./schema.js";
import { callSmartModel } from "../engine/runner.js";

function buildOpinionTrajectory(state: SimulationState): SimulationInsights["opinionTrajectory"] {
  return state.rounds.map((r) => ({
    round: r.roundNumber,
    avgOpinion: r.avgOpinion,
    positiveCount: r.positiveCount,
    negativeCount: r.negativeCount,
    neutralCount: r.neutralCount,
  }));
}

function buildInfluencers(state: SimulationState): InfluencerPersona[] {
  const reachCount: Record<string, number> = {};
  const actionsCount: Record<string, number> = {};

  for (const round of state.rounds) {
    for (const action of round.actions) {
      actionsCount[action.personaId] = (actionsCount[action.personaId] ?? 0) + 1;
    }
    for (const path of round.viralPaths) {
      reachCount[path.from] = (reachCount[path.from] ?? 0) + 1;
    }
  }

  return Object.entries(reachCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([personaId, reach]) => {
      const persona = state.population.find((p) => p.id === personaId);
      return {
        personaId,
        personaName: persona?.name ?? personaId,
        reachScore: Math.min(100, reach * 10),
        actionsCount: actionsCount[personaId] ?? 0,
      };
    });
}

function buildViralMoments(state: SimulationState): SimulationInsights["viralMoments"] {
  const reachByContent: Map<string, { reach: number; round: number; content: string; personaName: string }> = new Map();

  for (const round of state.rounds) {
    for (const path of round.viralPaths) {
      const key = path.content.slice(0, 50);
      const existing = reachByContent.get(key);
      if (existing) {
        existing.reach++;
      } else {
        reachByContent.set(key, {
          reach: 1,
          round: round.roundNumber,
          content: path.content,
          personaName: path.fromName,
        });
      }
    }
  }

  return Array.from(reachByContent.values())
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5);
}

function buildFinalDistribution(state: SimulationState): SimulationInsights["finalOpinionDistribution"] {
  const opinions = Object.values(state.agentOpinions);
  const total = opinions.length || 1;
  return {
    positive: Math.round((opinions.filter((o) => o > 2).length / total) * 100),
    negative: Math.round((opinions.filter((o) => o < -2).length / total) * 100),
    neutral: Math.round((opinions.filter((o) => o >= -2 && o <= 2).length / total) * 100),
  };
}

function buildCoalitions(state: SimulationState): Coalition[] {
  // Grupuj persony według finalnej opinii
  const positive: string[] = [];
  const negative: string[] = [];
  const neutral: string[] = [];

  for (const [personaId, opinion] of Object.entries(state.agentOpinions)) {
    if (opinion > 2) positive.push(personaId);
    else if (opinion < -2) negative.push(personaId);
    else neutral.push(personaId);
  }

  function dominantAffiliation(personaIds: string[]): string {
    const counts: Record<string, number> = {};
    for (const id of personaIds) {
      const p = state.population.find((p) => p.id === id);
      if (p) {
        counts[p.political.affiliation] = (counts[p.political.affiliation] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "nieznana";
  }

  const coalitions: Coalition[] = [];

  if (positive.length > 0) {
    coalitions.push({
      name: "Zwolennicy",
      size: positive.length,
      sentiment: "positive",
      keyPersonaIds: positive.slice(0, 3),
      dominantPoliticalAffiliation: dominantAffiliation(positive),
    });
  }
  if (negative.length > 0) {
    coalitions.push({
      name: "Krytycy",
      size: negative.length,
      sentiment: "negative",
      keyPersonaIds: negative.slice(0, 3),
      dominantPoliticalAffiliation: dominantAffiliation(negative),
    });
  }
  if (neutral.length > 0) {
    coalitions.push({
      name: "Obojętni",
      size: neutral.length,
      sentiment: "neutral",
      keyPersonaIds: neutral.slice(0, 3),
      dominantPoliticalAffiliation: dominantAffiliation(neutral),
    });
  }

  return coalitions;
}

export async function generateSimulationInsights(state: SimulationState): Promise<SimulationInsights> {
  const opinionTrajectory = buildOpinionTrajectory(state);
  const influencerPersonas = buildInfluencers(state);
  const viralMoments = buildViralMoments(state);
  const finalOpinionDistribution = buildFinalDistribution(state);
  const coalitionMap = buildCoalitions(state);

  // Zbierz przykładowe posty z każdej rundy
  const roundSummaries = state.rounds.map((r) => {
    const samplePosts = r.actions
      .filter((a) => a.content.length > 10)
      .slice(0, 3)
      .map((a) => `"${a.content.slice(0, 100)}"`)
      .join("; ");
    return `Runda ${r.roundNumber}: avg opinia ${r.avgOpinion.toFixed(1)}, pozytywni ${r.positiveCount}, negatywni ${r.negativeCount}. Przykładowe posty: ${samplePosts || "brak"}`;
  });

  // LLM synthesis
  const prompt = `Jesteś analitykiem reklamy. Przeanalizuj wyniki symulacji społecznej kampanii reklamowej marki "${state.knowledgeGraph.brand}" i napisz syntetyczny raport po polsku.

DANE SYMULACJI:
- Liczba rund: ${state.totalRounds}
- Liczba agentów: ${state.population.length}
- Seed: "${state.ad?.headline ?? state.topic?.query ?? "scenariusz"}" — ${(state.ad?.body ?? state.topic?.context ?? "").slice(0, 100)}

TRAJEKTORIA OPINII:
${roundSummaries.join("\n")}

DYSTRYBUCJA KOŃCOWA:
- Pozytywni: ${finalOpinionDistribution.positive}%
- Negatywni: ${finalOpinionDistribution.negative}%
- Neutralni: ${finalOpinionDistribution.neutral}%

KOALICJE:
${coalitionMap.map((c) => `- ${c.name} (${c.size} os., dominująca afiliacj: ${c.dominantPoliticalAffiliation})`).join("\n")}

WIRUSOWE MOMENTY:
${viralMoments.slice(0, 3).map((v) => `- Runda ${v.round}, ${v.personaName}: "${v.content.slice(0, 80)}"`).join("\n") || "brak"}

Napisz:
1. reportAgentSynthesis: 3-4 zdaniowe podsumowanie dynamiki symulacji i co ona oznacza dla kampanii
2. messageEvolution: jak narracja o reklamie ewoluowała przez rundy (po 1 zdaniu na rundę)
3. recommendations: 3-4 konkretne rekomendacje dla reklamodawcy

Odpowiedz WYŁĄCZNIE w JSON:
{
  "reportAgentSynthesis": "...",
  "messageEvolution": [{"round": 1, "dominantNarrative": "..."}, ...],
  "recommendations": ["...", "...", "..."]
}`;

  let reportAgentSynthesis = "Brak syntezy – błąd ReportAgent.";
  let messageEvolution: SimulationInsights["messageEvolution"] = [];
  let recommendations: string[] = [];

  try {
    const raw = await callSmartModel(
      "Jesteś ekspertem od analizy kampanii reklamowych. Piszesz po polsku. Odpowiadasz wyłącznie w JSON.",
      prompt,
      1200
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      reportAgentSynthesis = String(parsed.reportAgentSynthesis ?? reportAgentSynthesis);
      messageEvolution = Array.isArray(parsed.messageEvolution)
        ? parsed.messageEvolution.map((m: any) => ({
            round: Number(m.round),
            dominantNarrative: String(m.dominantNarrative ?? ""),
          }))
        : [];
      recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map(String)
        : [];
    }
  } catch (err) {
    console.error("⚠ ReportAgent error:", (err as Error).message);
  }

  return {
    opinionTrajectory,
    coalitionMap,
    influencerPersonas,
    viralMoments,
    messageEvolution,
    finalOpinionDistribution,
    reportAgentSynthesis,
    recommendations,
  };
}
