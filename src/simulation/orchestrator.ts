// ─────────────────────────────────────────────────────────────────────────────
// SimulationOrchestrator – zarządza całym cyklem symulacji
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { Persona } from "../personas/schema.js";
import { extractKnowledgeGraph } from "./graphrag.js";
import { AgentMemoryStore } from "./agentMemory.js";
import { runRound } from "./roundEngine.js";
import { generateSimulationInsights } from "./reportAgent.js";
import { BeliefState, extractTopicsFromRequirement } from "./beliefState.js";
import { SimulationTrajectory } from "./trajectoryTracker.js";
import type {
  SimulationConfig,
  SimulationState,
  SimulationRound,
  SimulationEvent,
  SimulationInsights,
  SimulationEventType,
  Platform,
} from "./schema.js";

// Post-simulation chat
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../engine/prompt.js";

const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export class SimulationOrchestrator {
  private state: SimulationState;
  private memoryStore: AgentMemoryStore;
  private platform: Platform;
  private activeAgentRatio: number;
  private agentBeliefs: Map<string, BeliefState> = new Map();
  private trajectory: SimulationTrajectory = new SimulationTrajectory();

  // Callback called after each round completes (for SSE streaming)
  onRoundComplete?: (round: SimulationRound) => void;

  constructor(config: SimulationConfig) {
    this.platform = config.platform ?? "facebook";
    this.activeAgentRatio = config.activeAgentRatio ?? 0.7;

    this.state = {
      id: randomUUID(),
      studyName: config.studyName,
      ad: config.ad,
      population: config.population,
      knowledgeGraph: {
        brand: config.ad.brandName ?? "nieznana",
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
    const topics = extractTopicsFromRequirement(
      `${config.ad.headline} ${config.ad.body} ${config.ad.brandName ?? ""}`
    );
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
  }

  // Faza init: wyciągnij KnowledgeGraph z materiału reklamowego
  async initialize(): Promise<void> {
    try {
      this.state.knowledgeGraph = await extractKnowledgeGraph(this.state.ad);
      this.state.status = "running";
      console.log(`✓ Symulacja ${this.state.id} zainicjowana. KG: brand="${this.state.knowledgeGraph.brand}", ${this.state.knowledgeGraph.claims.length} twierdzeń`);
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
    const previousActions = this.state.rounds.at(-1)?.actions ?? [];

    console.log(`▶ Runda ${roundNumber}/${this.state.totalRounds}...`);

    const round = await runRound({
      round: roundNumber,
      totalRounds: this.state.totalRounds,
      population: this.state.population,
      agentOpinions: this.state.agentOpinions,
      agentBeliefs: this.agentBeliefs,
      memoryStore: this.memoryStore,
      knowledgeGraph: this.state.knowledgeGraph,
      previousActions,
      events: this.state.events,
      platform: this.platform,
      activeAgentRatio: this.activeAgentRatio,
      onProgress,
    });

    this.state.rounds.push(round);
    this.state.currentRound = roundNumber;
    this.state.agentMemory = this.memoryStore.serialize();
    this.state.agentMemoryCompacted = this.memoryStore.serializeCompacted();

    // Zaktualizuj trajectory
    this.trajectory.recordRound(round, this.agentBeliefs);

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

  // Sklonuj symulację do nowego orchestratora (fork dla "what if")
  // Opcjonalnie wstrzyknij dodatkowy event w momencie forka
  fork(newStudyName: string, injectedEvent?: Omit<SimulationEvent, "id">): SimulationOrchestrator {
    const forkedConfig: SimulationConfig = {
      studyName: newStudyName,
      ad: this.state.ad,
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

      const resp = await anthropicClient.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      });
      return resp.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("");
    }

    // Chat z konkretną personą (personaId jest string, sprawdzono wyżej)
    const pid = personaId as string;
    const memorySummary = this.memoryStore.getSummary(pid);
    const currentOpinion = this.state.agentOpinions[pid] ?? 0;

    const systemPrompt = buildSystemPrompt(persona, {
      memorySummary,
      currentOpinion,
      knowledgeGraph: this.state.knowledgeGraph,
      roundNumber: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      platform: this.platform,
      recentFeed: [],
      activeEvents: [],
    });

    const resp = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: systemPrompt + "\n\nKtoś rozmawia z Tobą bezpośrednio. Odpowiadaj jako ta persona – po polsku, naturalnie.",
      messages: [{ role: "user", content: message }],
    });
    return resp.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("");
  }

  getState(): SimulationState {
    return this.state;
  }

  getId(): string {
    return this.state.id;
  }

  serialize(): string {
    // Serializuj BeliefState per agent
    const agentBeliefsData: Record<string, ReturnType<BeliefState["toDict"]>> = {};
    for (const [id, bs] of this.agentBeliefs.entries()) {
      agentBeliefsData[id] = bs.toDict();
    }
    return JSON.stringify({
      state: this.state,
      platform: this.platform,
      activeAgentRatio: this.activeAgentRatio,
      agentBeliefsData,
    });
  }

  static deserialize(json: string): SimulationOrchestrator {
    const { state, platform, activeAgentRatio, agentBeliefsData } = JSON.parse(json);
    const orc = new SimulationOrchestrator({
      studyName: state.studyName,
      ad: state.ad,
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
    // Przywróć BeliefState jeśli był zapisany
    if (agentBeliefsData) {
      orc.agentBeliefs = new Map();
      for (const [id, data] of Object.entries(agentBeliefsData)) {
        orc.agentBeliefs.set(id, BeliefState.fromDict(data as any));
      }
    }
    return orc;
  }
}
