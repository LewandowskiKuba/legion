// ─────────────────────────────────────────────────────────────────────────────
// Round Engine – wykonuje jedną rundę symulacji społecznej
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona } from "../personas/schema.js";
import { buildSystemPrompt, buildSimulationUserPrompt, type SimulationContext } from "../engine/prompt.js";
import { runPersonaBatch } from "../engine/runner.js";
import type {
  AgentAction,
  ActionType,
  KnowledgeGraph,
  MemoryEntry,
  Platform,
  SimulationEvent,
  SimulationRound,
} from "./schema.js";
import { AgentMemoryStore } from "./agentMemory.js";
import { BeliefState, type PostSeen } from "./beliefState.js";

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function parseAgentRoundResponse(
  personaId: string,
  personaName: string,
  raw: string,
  round: number,
  platform: Platform,
  currentOpinion: number
): AgentAction {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Brak JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    const opinionDelta = clamp(Number(parsed.opinionDelta ?? 0), -3, 3);
    const newOpinion = clamp(currentOpinion + opinionDelta, -10, 10);

    return {
      personaId,
      personaName,
      round,
      platform,
      actionType: (parsed.actionType ?? "ignore") as ActionType,
      content: String(parsed.content ?? ""),
      targetPersonaId: parsed.targetPersonaId ?? undefined,
      opinionDelta,
      currentOpinion: newOpinion,
    };
  } catch {
    return {
      personaId,
      personaName,
      round,
      platform,
      actionType: "ignore",
      content: "",
      opinionDelta: 0,
      currentOpinion,
    };
  }
}

// ─── Hot score feed ───────────────────────────────────────────────────────────
// hotScore = (1 + reactions) / (ageInRounds + 1)^1.5
// reactions = likes + comments + shares targeting the post's author after the round
// Social connections get a 2× boost.

function hotScore(
  action: AgentAction,
  allActions: AgentAction[],
  currentRound: number,
  isConnection: boolean
): number {
  const age = currentRound - action.round; // rounds since posted
  const reactions = allActions.filter(
    (a) =>
      a.targetPersonaId === action.personaId &&
      a.round > action.round &&
      ["like", "comment", "share"].includes(a.actionType)
  ).length;
  const base = (1 + reactions) / Math.pow(age + 1, 1.5);
  return isConnection ? base * 2 : base;
}

// Buduje feed dla agenta: top-8 postów wg hot score (z boostem dla połączeń społecznych)
function buildFeedForPersona(
  personaId: string,
  allPastActions: AgentAction[],   // wszystkie akcje ze wszystkich rund
  personaMap: Map<string, string>,  // id → name
  socialConnections: Set<string>,   // kogo obserwuje agent
  currentRound: number
): Array<{ personaName: string; content: string; actionType: string }> {
  const candidates = allPastActions.filter(
    (a) =>
      a.personaId !== personaId &&
      ["post", "comment", "share"].includes(a.actionType) &&
      a.content.length > 0
  );

  return candidates
    .map((a) => ({
      action: a,
      score: hotScore(a, allPastActions, currentRound, socialConnections.has(a.personaId)),
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map(({ action: a }) => ({
      personaName: a.personaName,
      content: a.content,
      actionType: a.actionType,
    }));
}

// Policz ile razy agentowi zalajkowano/zdyslajkowano w tej rundzie
function viralPathsForPersona(
  actions: AgentAction[],
  personaId: string,
  actionType: ActionType
): number {
  return actions.filter(
    (a) => a.targetPersonaId === personaId && a.actionType === actionType
  ).length;
}

export async function runRound(params: {
  round: number;
  totalRounds: number;
  population: Persona[];
  agentOpinions: Record<string, number>;
  agentBeliefs: Map<string, BeliefState>;
  memoryStore: AgentMemoryStore;
  knowledgeGraph: KnowledgeGraph;
  allPastActions: AgentAction[];      // wszystkie akcje ze wszystkich poprzednich rund
  socialGraph: Map<string, Set<string>>; // Barabási-Albert: id → Set<followingId>
  events: SimulationEvent[];
  platform: Platform;
  activeAgentRatio: number;
  seedType?: "ad" | "topic";
  onProgress?: (done: number, total: number) => void;
}): Promise<SimulationRound> {
  const {
    round,
    totalRounds,
    population,
    agentOpinions,
    agentBeliefs,
    memoryStore,
    knowledgeGraph,
    allPastActions,
    socialGraph,
    events,
    platform,
    activeAgentRatio,
    seedType,
    onProgress,
  } = params;

  // Losowo wybierz aktywnych agentów tej rundy
  const shuffled = [...population].sort(() => Math.random() - 0.5);
  const activeCount = Math.max(1, Math.round(population.length * activeAgentRatio));
  const activePersonas = shuffled.slice(0, activeCount);

  const personaMap = new Map(population.map((p) => [p.id, p.name]));

  // Aktywne eventy tej rundy
  const activeEvents = events
    .filter((e) => e.injectedAt <= round)
    .map((e) => ({ type: e.type, content: e.content }));

  // Uruchom batch
  const actions = await runPersonaBatch<AgentAction>(
    activePersonas,
    (persona) => {
      const currentOpinion = agentOpinions[persona.id] ?? 0;
      const memorySummary = memoryStore.getSummary(persona.id);
      const connections = socialGraph.get(persona.id) ?? new Set<string>();
      const recentFeed = buildFeedForPersona(persona.id, allPastActions, personaMap, connections, round);

      const beliefState = agentBeliefs.get(persona.id);
      const beliefText = beliefState?.toPromptText() ?? "";

      const simCtx: SimulationContext = {
        memorySummary: [memorySummary, beliefText].filter(Boolean).join("\n\n"),
        currentOpinion,
        knowledgeGraph,
        roundNumber: round,
        totalRounds,
        platform,
        recentFeed,
        activeEvents,
        seedType,
      };

      return {
        systemPrompt: buildSystemPrompt(persona, simCtx),
        userPrompt: buildSimulationUserPrompt(simCtx),
      };
    },
    (personaId, raw) => {
      const persona = activePersonas.find((p) => p.id === personaId)!;
      const currentOpinion = agentOpinions[personaId] ?? 0;
      return parseAgentRoundResponse(personaId, persona.name, raw, round, platform, currentOpinion);
    },
    onProgress
  );

  // Zaktualizuj opinie, pamięć i BeliefState
  for (const action of actions) {
    agentOpinions[action.personaId] = action.currentOpinion;

    // Dodaj do pamięci agenta
    const entry: MemoryEntry = {
      round,
      type: "saw_post",
      content: action.content || `${action.actionType} w rundzie ${round}`,
      emotionalValence: action.opinionDelta > 0 ? 1 : action.opinionDelta < 0 ? -1 : 0,
    };
    memoryStore.add(action.personaId, entry);

    // Jeśli ktoś był targetowany – dodaj mu do pamięci + zaktualizuj trust
    if (action.targetPersonaId && ["comment", "share"].includes(action.actionType)) {
      const targetEntry: MemoryEntry = {
        round,
        type: "received_comment",
        fromPersonaId: action.personaId,
        fromPersonaName: action.personaName,
        content: action.content,
        emotionalValence: 0,
      };
      memoryStore.add(action.targetPersonaId, targetEntry);

      // Interakcja wpływa na zaufanie między agentami
      const targetBs = agentBeliefs.get(action.targetPersonaId);
      if (targetBs) {
        targetBs.updateTrust(action.personaId, action.actionType === "like" ? "like" : "follow");
      }
    }
  }

  // Zaktualizuj BeliefState dla każdego aktywnego agenta na podstawie feedu
  for (const persona of activePersonas) {
    const bs = agentBeliefs.get(persona.id);
    if (!bs) continue;

    const connections = socialGraph.get(persona.id) ?? new Set<string>();
    const feed = buildFeedForPersona(persona.id, allPastActions, personaMap, connections, round);
    const postsSeen: PostSeen[] = feed.map((f) => ({
      content: f.content,
      authorId: actions.find((a) => a.personaName === f.personaName)?.personaId,
    }));

    const ownActions = actions.filter((a) => a.personaId === persona.id);
    const likesReceived = viralPathsForPersona(actions, persona.id, "like");
    const dislikesReceived = viralPathsForPersona(actions, persona.id, "react_neg");

    bs.updateFromRound({
      postsSeen,
      ownEngagement: { likesReceived, dislikesReceived },
      roundNum: round,
    });
  }

  // Oblicz statystyki rundy
  const opinionSnapshot: Record<string, number> = { ...agentOpinions };

  const allOpinions = Object.values(opinionSnapshot);
  const avgOpinion = allOpinions.length > 0
    ? allOpinions.reduce((a, b) => a + b, 0) / allOpinions.length
    : 0;

  const positiveCount = allOpinions.filter((o) => o > 2).length;
  const negativeCount = allOpinions.filter((o) => o < -2).length;
  const neutralCount = allOpinions.length - positiveCount - negativeCount;

  // Zidentyfikuj ścieżki viralne (comment/share z contentową treścią)
  const viralPaths = actions
    .filter((a) => a.targetPersonaId && a.content.length > 10)
    .map((a) => ({
      from: a.personaId,
      fromName: a.personaName,
      to: a.targetPersonaId!,
      toName: personaMap.get(a.targetPersonaId!) ?? "?",
      content: a.content,
    }));

  return {
    roundNumber: round,
    actions,
    opinionSnapshot,
    avgOpinion,
    positiveCount,
    negativeCount,
    neutralCount,
    viralPaths,
  };
}
