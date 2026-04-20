// ─────────────────────────────────────────────────────────────────────────────
// SimulationOrchestrator – zarządza całym cyklem symulacji
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { Persona } from "../personas/schema.js";
import { extractKnowledgeGraph, extractKnowledgeGraphFromTopic } from "./graphrag.js";
import { AgentMemoryStore } from "./agentMemory.js";
import { runRound } from "./roundEngine.js";
import { generateSimulationInsights } from "./reportAgent.js";
import { BeliefState, extractTopicsFromRequirement } from "./beliefState.js";
import { SimulationTrajectory } from "./trajectoryTracker.js";
import { buildSocialGraph } from "./socialGraph.js";
import type {
  Frame,
  FrameRoundStats,
  SimulationConfig,
  SimulationState,
  SimulationRound,
  SimulationEvent,
  SimulationInsights,
  SimulationEventType,
  Platform,
} from "./schema.js";

import { buildSystemPrompt } from "../engine/prompt.js";
import { callSmartModel, callModelRaw } from "../engine/runner.js";
import { getPolymarketContext } from "../polymarket/index.js";
import { selectModel } from "../engine/modelRouter.js";

export class SimulationOrchestrator {
  private state: SimulationState;
  private memoryStore: AgentMemoryStore;
  private platform: Platform;
  private activeAgentRatio: number;
  private agentBeliefs: Map<string, BeliefState> = new Map();
  private trajectory: SimulationTrajectory = new SimulationTrajectory();
  private socialGraph: Map<string, Set<string>> = new Map();
  private frames: Frame[] = [];
  private agentFrames: Map<string, string> = new Map(); // personaId → frameId

  // Callback called after each round completes (for SSE streaming)
  onRoundComplete?: (round: SimulationRound) => void;

  constructor(config: SimulationConfig) {
    this.platform = config.platform ?? "facebook";
    this.activeAgentRatio = config.activeAgentRatio ?? 0.7;

    const seedLabel = config.seedType === "topic"
      ? (config.topic?.query.slice(0, 40) ?? "scenariusz")
      : (config.ad?.brandName ?? "reklama");

    this.state = {
      id: randomUUID(),
      studyName: config.studyName,
      seedType: config.seedType,
      ad: config.ad,
      topic: config.topic,
      population: config.population,
      knowledgeGraph: {
        brand: seedLabel,
        claims: [],
        values: [],
        competitors: [],
        emotionalAnchors: [],
        controversialElements: [],
      },
      rounds: [],
      agentMemory: {},
      agentOpinions: {},
      events: [],
      status: "initializing",
      currentRound: 0,
      totalRounds: config.totalRounds,
      createdAt: new Date().toISOString(),
    };

    this.memoryStore = new AgentMemoryStore();

    // Inicjuj opinie bazowe na 0 i BeliefState per persona
    const seedText = config.seedType === "topic"
      ? `${config.topic?.query ?? ""} ${config.topic?.context ?? ""}`
      : `${config.ad?.headline ?? ""} ${config.ad?.body ?? ""} ${config.ad?.brandName ?? ""}`;

    const topics = extractTopicsFromRequirement(seedText);
    for (const persona of config.population) {
      this.state.agentOpinions[persona.id] = 0;
      this.agentBeliefs.set(
        persona.id,
        BeliefState.fromProfile({
          sentimentBias: ((persona.psychographic.traditionalism ?? 50) - 50) / 100,
          topics,
        })
      );
    }

    // Zbuduj graf społeczny Barabási-Albert raz dla całej symulacji
    this.socialGraph = buildSocialGraph(config.population.map((p) => p.id));
    console.log(`🕸 Graf społeczny: ${config.population.length} węzłów, BA m=3`);

    // Competitive contagion: seeding framingów (~5% populacji per frame)
    if (config.frames && config.frames.length > 0) {
      this.frames = config.frames;
      this.state.frames = config.frames;
      this.state.frameStats = [];
      const seedRatio = 0.05;
      const seedCount = Math.max(1, Math.round(config.population.length * seedRatio));
      const shuffled = [...config.population].sort(() => Math.random() - 0.5);
      let offset = 0;
      for (const frame of config.frames) {
        const seedAgents = shuffled.slice(offset, offset + seedCount);
        for (const agent of seedAgents) this.agentFrames.set(agent.id, frame.id);
        offset += seedCount;
      }
      // Seed posty (runda 0) — widoczne od pierwszej rundy w feedzie
      const seedActions = config.frames.flatMap(frame => {
        const carriers = [...this.agentFrames.entries()]
          .filter(([, fid]) => fid === frame.id)
          .map(([pid]) => config.population.find(p => p.id === pid)!)
          .filter(Boolean);
        return carriers.map(agent => ({
          personaId: agent.id,
          personaName: agent.name,
          round: 0,
          platform: this.platform,
          actionType: "post" as const,
          content: frame.text,
          opinionDelta: 0,
          currentOpinion: 0,
          frameId: frame.id,
        }));
      });
      // Wstrzyknij jako zerowa runda do historii
      if (seedActions.length > 0) {
        this.state.rounds.push({
          roundNumber: 0,
          actions: seedActions,
          opinionSnapshot: { ...this.state.agentOpinions },
          avgOpinion: 0,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: config.population.length,
          viralPaths: [],
          frameAdoption: Object.fromEntries(config.frames.map(f => [f.id, seedCount])),
        });
      }
      console.log(`🔀 Competitive contagion: ${config.frames.length} framingów, ${seedCount} seed agentów/frame`);
    }
  }

  // Faza init: wyciągnij KnowledgeGraph z seeda (reklama lub scenariusz)
  async initialize(): Promise<void> {
    try {
      if (this.state.seedType === "topic") {
        if (!this.state.topic) throw new Error("Brak topic seed w konfiguracji");
        this.state.knowledgeGraph = await extractKnowledgeGraphFromTopic(this.state.topic);
      } else {
        if (!this.state.ad) throw new Error("Brak ad material w konfiguracji");
        this.state.knowledgeGraph = await extractKnowledgeGraph(this.state.ad);
      }
      this.state.status = "running";
      console.log(`✓ Symulacja ${this.state.id} [${this.state.seedType}] zainicjowana. KG: brand="${this.state.knowledgeGraph.brand}", ${this.state.knowledgeGraph.claims.length} twierdzeń`);
    } catch (err) {
      this.state.status = "error";
      this.state.errorMessage = (err as Error).message;
      throw err;
    }
  }

  // Uruchom jedną rundę
  async runNextRound(onProgress?: (done: number, total: number) => void): Promise<SimulationRound> {
    if (this.state.status !== "running") {
      throw new Error(`Symulacja nie jest aktywna (status: ${this.state.status})`);
    }
    if (this.state.currentRound >= this.state.totalRounds) {
      throw new Error("Wszystkie rundy zostały wykonane");
    }

    const roundNumber = this.state.currentRound + 1;
    const allPastActions = this.state.rounds.flatMap((r) => r.actions);

    console.log(`▶ Runda ${roundNumber}/${this.state.totalRounds}...`);

    const round = await runRound({
      round: roundNumber,
      totalRounds: this.state.totalRounds,
      population: this.state.population,
      agentOpinions: this.state.agentOpinions,
      agentBeliefs: this.agentBeliefs,
      memoryStore: this.memoryStore,
      knowledgeGraph: this.state.knowledgeGraph,
      allPastActions,
      socialGraph: this.socialGraph,
      events: this.state.events,
      platform: this.platform,
      activeAgentRatio: this.activeAgentRatio,
      seedType: this.state.seedType,
      frames: this.frames.length > 0 ? this.frames : undefined,
      agentFrames: this.frames.length > 0 ? this.agentFrames : undefined,
      onProgress,
    });

    this.state.rounds.push(round);
    this.state.currentRound = roundNumber;
    this.state.agentFrames = Object.fromEntries(this.agentFrames);
    this.state.agentMemory = this.memoryStore.serialize();
    this.state.agentMemoryCompacted = this.memoryStore.serializeCompacted();

    // Zaktualizuj trajectory
    this.trajectory.recordRound(round, this.agentBeliefs);

    // Frame stats per runda
    if (this.frames.length > 0 && round.frameAdoption) {
      const totalAgents = this.state.population.length;
      const frameShare: Record<string, number> = {};
      for (const [fid, count] of Object.entries(round.frameAdoption)) {
        frameShare[fid] = totalAgents > 0 ? count / totalAgents : 0;
      }
      const stats: FrameRoundStats = {
        roundNumber,
        frameAdoption: round.frameAdoption,
        frameShare,
        byAgeGroup: this.computeFrameSegment("age"),
        byPolitical: this.computeFrameSegment("political"),
      };
      if (!this.state.frameStats) this.state.frameStats = [];
      this.state.frameStats.push(stats);
    }

    // Memory compaction w tle (nie blokuje rundy)
    this.memoryStore.compactAll(this.state.population).catch((err) =>
      console.warn("⚠ Compaction error:", (err as Error).message)
    );

    console.log(`✓ Runda ${roundNumber} zakończona. Avg opinia: ${round.avgOpinion.toFixed(2)}, viral paths: ${round.viralPaths.length}`);

    this.onRoundComplete?.(round);

    return round;
  }

  // Uruchom wszystkie pozostałe rundy
  async runToCompletion(onProgress?: (round: number, total: number) => void): Promise<void> {
    while (this.state.currentRound < this.state.totalRounds) {
      if (this.state.status !== "running") break;
      await this.runNextRound();
      onProgress?.(this.state.currentRound, this.state.totalRounds);
    }
    await this.finalize();
  }

  // Generuje insights i oznacza symulację jako zakończoną
  async finalize(): Promise<SimulationInsights> {
    this.state.status = "running"; // Upewnij się, że status jest właściwy
    console.log("⚙ Generuję insights (ReportAgent)...");
    try {
      // Zapisz trajectory do state przed generowaniem insights
      this.state.trajectory = this.trajectory.toData(this.state.agentOpinions);

      const insights = await generateSimulationInsights(this.state);
      this.state.insights = insights;
      this.state.status = "complete";
      this.state.completedAt = new Date().toISOString();
      console.log("✓ Insights wygenerowane");
      return insights;
    } catch (err) {
      this.state.status = "error";
      this.state.errorMessage = (err as Error).message;
      throw err;
    }
  }

  // Oblicza adopcję framingów per segment demograficzny
  private computeFrameSegment(dim: "age" | "political"): import("./schema.js").FrameSegmentStats[] {
    type Bucket = Record<string, Record<string, number>>; // segment → frameId → count
    const buckets: Bucket = {};

    for (const persona of this.state.population) {
      const frameId = this.agentFrames.get(persona.id);
      if (!frameId) continue;

      let segment: string;
      if (dim === "age") {
        const age = persona.demographic?.age ?? 0;
        segment = age < 30 ? "18–29" : age < 45 ? "30–44" : age < 60 ? "45–59" : "60+";
      } else {
        segment = (persona.political?.affiliation as string) ?? "nieokreślony";
      }

      if (!buckets[segment]) buckets[segment] = {};
      buckets[segment][frameId] = (buckets[segment][frameId] ?? 0) + 1;
    }

    return Object.entries(buckets).map(([segment, frameCounts]) => {
      const total = Object.values(frameCounts).reduce((a, b) => a + b, 0);
      const frameShares: Record<string, number> = {};
      for (const [fid, count] of Object.entries(frameCounts)) {
        frameShares[fid] = total > 0 ? count / total : 0;
      }
      return { segment, frameShares };
    });
  }

  // Sklonuj symulację do nowego orchestratora (fork dla "what if")
  // Opcjonalnie wstrzyknij dodatkowy event w momencie forka
  fork(newStudyName: string, injectedEvent?: Omit<SimulationEvent, "id">): SimulationOrchestrator {
    const forkedConfig: SimulationConfig = {
      studyName: newStudyName,
      seedType: this.state.seedType,
      ad: this.state.ad,
      topic: this.state.topic,
      population: this.state.population,
      totalRounds: this.state.totalRounds,
      platform: this.platform,
      activeAgentRatio: this.activeAgentRatio,
    };

    const forked = new SimulationOrchestrator(forkedConfig);

    // Kopiuj stan symulacji
    forked.state = {
      ...JSON.parse(JSON.stringify(this.state)),
      id: randomUUID(),
      studyName: newStudyName,
      status: "running",
      completedAt: undefined,
      errorMessage: undefined,
    };

    // Kopiuj pamięć agentów
    forked.memoryStore = AgentMemoryStore.deserialize(
      this.memoryStore.serialize(),
      this.memoryStore.serializeCompacted()
    );

    // Kopiuj BeliefState per agent
    forked.agentBeliefs = new Map();
    for (const [id, bs] of this.agentBeliefs.entries()) {
      forked.agentBeliefs.set(id, BeliefState.fromDict(bs.toDict()));
    }

    // Kopiuj graf społeczny (ta sama struktura co oryginał)
    forked.socialGraph = new Map();
    for (const [id, connections] of this.socialGraph.entries()) {
      forked.socialGraph.set(id, new Set(connections));
    }

    // Opcjonalny event przy forku
    if (injectedEvent) {
      forked.injectEvent(injectedEvent);
    }

    console.log(`🍴 Fork: ${this.state.studyName} → ${newStudyName} (od rundy ${forked.state.currentRound})`);
    return forked;
  }

  // Wstrzyknij event do symulacji
  injectEvent(event: Omit<SimulationEvent, "id">): SimulationEvent {
    const fullEvent: SimulationEvent = { ...event, id: randomUUID() };
    this.state.events.push(fullEvent);
    console.log(`⚡ Event wstrzyknięty: [${fullEvent.type}] ${fullEvent.content.slice(0, 60)}`);
    return fullEvent;
  }

  // Chat z konkretnym agentem po symulacji
  async chatWithAgent(personaId: string | null, message: string): Promise<string> {
    let persona: Persona | undefined;

    if (personaId) {
      persona = this.state.population.find((p) => p.id === personaId);
      if (!persona) throw new Error(`Persona ${personaId} nie istnieje`);
    }

    if (!persona) {
      // Chat z ReportAgent
      const systemPrompt = `Jesteś ReportAgent – analitykiem, który właśnie zakończył symulację społeczną kampanii reklamowej "${this.state.knowledgeGraph.brand}". Odpowiadasz po polsku, zwięźle i analitycznie.

Podsumowanie symulacji:
${this.state.insights?.reportAgentSynthesis ?? "Symulacja w toku"}

Rekomendacje: ${this.state.insights?.recommendations?.join("; ") ?? "brak"}`;

      return callSmartModel(systemPrompt, message, 512);
    }

    // Chat z konkretną personą (personaId jest string, sprawdzono wyżej)
    const pid = personaId as string;
    const memorySummary = this.memoryStore.getSummary(pid);
    const currentOpinion = this.state.agentOpinions[pid] ?? 0;

    const polyCtx = await getPolymarketContext();
    const systemPrompt = buildSystemPrompt(persona, {
      memorySummary,
      currentOpinion,
      knowledgeGraph: this.state.knowledgeGraph,
      roundNumber: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      platform: this.platform,
      recentFeed: [],
      activeEvents: [],
    }, polyCtx);

    return callModelRaw(
      selectModel(persona),
      systemPrompt + "\n\nKtoś rozmawia z Tobą bezpośrednio. Odpowiadaj jako ta persona – po polsku, naturalnie.",
      message,
      512,
    );
  }

  getState(): SimulationState {
    return this.state;
  }

  getId(): string {
    return this.state.id;
  }

  serialize(): string {
    const agentBeliefsData: Record<string, ReturnType<BeliefState["toDict"]>> = {};
    for (const [id, bs] of this.agentBeliefs.entries()) {
      agentBeliefsData[id] = bs.toDict();
    }
    // Serialize socialGraph: Map<string, Set<string>> → Record<string, string[]>
    const socialGraphData: Record<string, string[]> = {};
    for (const [id, connections] of this.socialGraph.entries()) {
      socialGraphData[id] = [...connections];
    }
    const agentFramesData = Object.fromEntries(this.agentFrames);
    return JSON.stringify({
      state: this.state,
      platform: this.platform,
      activeAgentRatio: this.activeAgentRatio,
      agentBeliefsData,
      socialGraphData,
      framesData: this.frames,
      agentFramesData,
    });
  }

  static deserialize(json: string): SimulationOrchestrator {
    const { state, platform, activeAgentRatio, agentBeliefsData, socialGraphData, framesData, agentFramesData } = JSON.parse(json);
    const orc = new SimulationOrchestrator({
      studyName: state.studyName,
      seedType: state.seedType ?? "ad",
      ad: state.ad,
      topic: state.topic,
      population: state.population,
      totalRounds: state.totalRounds,
      platform,
      activeAgentRatio,
    });
    orc.state = state;
    orc.memoryStore = AgentMemoryStore.deserialize(
      state.agentMemory ?? {},
      state.agentMemoryCompacted ?? {}
    );
    if (agentBeliefsData) {
      orc.agentBeliefs = new Map();
      for (const [id, data] of Object.entries(agentBeliefsData)) {
        orc.agentBeliefs.set(id, BeliefState.fromDict(data as any));
      }
    }
    // Restore social graph (overrides the one generated in constructor)
    if (socialGraphData) {
      orc.socialGraph = new Map();
      for (const [id, connections] of Object.entries(socialGraphData)) {
        orc.socialGraph.set(id, new Set(connections as string[]));
      }
    }
    if (framesData) orc.frames = framesData;
    if (agentFramesData) {
      orc.agentFrames = new Map(Object.entries(agentFramesData) as [string, string][]);
    }
    return orc;
  }
}
