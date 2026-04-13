// ─────────────────────────────────────────────────────────────────────────────
// Simulation schema – Swarm v2
// Multi-round social simulation types
// ─────────────────────────────────────────────────────────────────────────────

import type { Persona, AdMaterial } from "../personas/schema.js";

// ─── Action types ─────────────────────────────────────────────────────────────

export type ActionType =
  | "post"       // Publishes new content
  | "comment"    // Replies to another agent's post
  | "share"      // Shares with optional comment
  | "like"       // Passive positive signal
  | "ignore"     // No action this round
  | "react_neg"; // Dislike / angry reaction

export type Platform = "facebook" | "twitter";

// ─── Per-round agent action ───────────────────────────────────────────────────

export interface AgentAction {
  personaId: string;
  personaName: string;
  round: number;
  platform: Platform;
  actionType: ActionType;
  content: string;
  targetPersonaId?: string;    // For comment/share/react
  opinionDelta: number;        // -3 to +3 shift this round
  currentOpinion: number;      // Running opinion score (-10 to +10)
}

// ─── Agent memory ─────────────────────────────────────────────────────────────

export type MemoryEventType =
  | "saw_post"
  | "received_comment"
  | "shared"
  | "heard_wom"
  | "saw_ad"
  | "injected_event";

export interface MemoryEntry {
  round: number;
  type: MemoryEventType;
  fromPersonaId?: string;
  fromPersonaName?: string;
  content: string;
  emotionalValence: -1 | 0 | 1;
}

// ─── Knowledge graph ──────────────────────────────────────────────────────────

export interface KnowledgeGraph {
  brand: string;
  claims: string[];                // Key claims from ad
  values: string[];                // Brand values
  competitors: string[];           // Mentioned or implied competitors
  emotionalAnchors: string[];      // Key emotional triggers
  controversialElements: string[]; // Elements likely to polarize
}

// ─── Simulation round ─────────────────────────────────────────────────────────

export interface SimulationRound {
  roundNumber: number;
  actions: AgentAction[];
  opinionSnapshot: Record<string, number>;  // personaId → opinion
  avgOpinion: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  viralPaths: Array<{ from: string; fromName: string; to: string; toName: string; content: string }>;
}

// ─── Injected event ───────────────────────────────────────────────────────────

export type SimulationEventType =
  | "breaking_news"
  | "influencer_post"
  | "competitor_ad"
  | "crisis"
  | "pr_response";

export interface SimulationEvent {
  id: string;
  injectedAt: number;               // Round when injected
  type: SimulationEventType;
  content: string;
  affectedPersonaIds?: string[];    // Undefined = all personas
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface Coalition {
  name: string;
  size: number;
  sentiment: "positive" | "negative" | "neutral";
  keyPersonaIds: string[];
  dominantPoliticalAffiliation: string;
}

export interface InfluencerPersona {
  personaId: string;
  personaName: string;
  reachScore: number;              // 0–100
  actionsCount: number;
}

export interface SimulationInsights {
  opinionTrajectory: Array<{ round: number; avgOpinion: number; positiveCount: number; negativeCount: number; neutralCount: number }>;
  coalitionMap: Coalition[];
  influencerPersonas: InfluencerPersona[];
  viralMoments: Array<{ round: number; content: string; reach: number; personaName: string }>;
  messageEvolution: Array<{ round: number; dominantNarrative: string }>;
  finalOpinionDistribution: { positive: number; negative: number; neutral: number };
  reportAgentSynthesis: string;    // LLM-generated qualitative narrative (PL)
  recommendations: string[];
}

// ─── BeliefState snapshot ─────────────────────────────────────────────────────

export interface BeliefStateSnapshot {
  personaId: string;
  positions: Record<string, number>;    // topic → stance (-1 to +1)
  confidence: Record<string, number>;   // topic → certainty (0 to 1)
  trust: Record<string, number>;        // agentId → trust (0 to 1)
  exposureCount: number;
}

// ─── Simulation trajectory ────────────────────────────────────────────────────
// Per-round belief snapshots + turning points + convergence metrics

export interface TrajectoryRound {
  roundNumber: number;
  avgOpinion: number;
  beliefSnapshots: BeliefStateSnapshot[];   // Subset of agents (to limit size)
  convergenceScore: number;  // 0–1: how aligned agents are (higher = more consensus)
}

export interface TurningPoint {
  roundNumber: number;
  description: string;     // What changed
  opinionDelta: number;    // Avg opinion change this round
  triggerPersonaId?: string;
}

export interface SimulationTrajectoryData {
  rounds: TrajectoryRound[];
  turningPoints: TurningPoint[];
  finalConvergence: number;   // 0–1
  polarizationIndex: number;  // 0–1: how split the population is
}

// ─── Simulation state ─────────────────────────────────────────────────────────

export type SimulationStatus = "initializing" | "running" | "paused" | "complete" | "error";

export interface SimulationState {
  id: string;
  studyName: string;
  ad: AdMaterial;
  population: Persona[];
  knowledgeGraph: KnowledgeGraph;
  rounds: SimulationRound[];
  agentMemory: Record<string, MemoryEntry[]>;   // personaId → memory
  agentMemoryCompacted?: Record<string, string>; // personaId → compacted summary
  agentOpinions: Record<string, number>;         // personaId → current opinion (-10 to +10)
  agentBeliefs?: Record<string, BeliefStateSnapshot>; // personaId → current beliefs
  events: SimulationEvent[];
  trajectory?: SimulationTrajectoryData;
  status: SimulationStatus;
  currentRound: number;
  totalRounds: number;
  insights?: SimulationInsights;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SimulationConfig {
  studyName: string;
  ad: AdMaterial;
  population: Persona[];
  totalRounds: number;
  platform?: Platform;             // Default: "facebook"
  activeAgentRatio?: number;       // 0–1, fraction of agents acting per round (default 0.7)
}
