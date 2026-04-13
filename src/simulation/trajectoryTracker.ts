// ─────────────────────────────────────────────────────────────────────────────
// SimulationTrajectory – śledzi ewolucję przekonań i punkty zwrotne
// Port z MiroShark (round_analyzer.py) z adaptacjami do TypeScript/Legion
//
// Funkcje:
//   recordRound()       – zapisuje snapshot po każdej rundzie
//   computeConvergence() – jak bardzo agenci są zgodni (0=chaos, 1=pełen konsensus)
//   findTurningPoints() – rundy gdzie opinia zmieniła się o >THRESHOLD
//   computePolarization()– indeks polaryzacji (frakcja na skrajnych biegunach)
//   toData()            – eksport do SimulationTrajectoryData dla orchestratora
// ─────────────────────────────────────────────────────────────────────────────

import type {
  SimulationRound,
  BeliefStateSnapshot,
  TrajectoryRound,
  TurningPoint,
  SimulationTrajectoryData,
} from "./schema.js";
import type { BeliefState } from "./beliefState.js";

const TURNING_POINT_THRESHOLD = 0.8;  // Zmiana avg opinii między rundami (na skali -10..+10)
const MAX_SNAPSHOTS_PER_ROUND = 20;   // Limit agentów w snapshot (oszczędność pamięci)

export class SimulationTrajectory {
  private trajectoryRounds: TrajectoryRound[] = [];
  private previousAvgOpinion: number | null = null;

  // Wywołaj po każdej zakończonej rundzie
  recordRound(
    round: SimulationRound,
    agentBeliefs: Map<string, BeliefState>
  ): void {
    // Snapshot przekonań – losowy podzbiór agentów, żeby nie puchnąć
    const personaIds = Array.from(agentBeliefs.keys());
    const sampleIds =
      personaIds.length > MAX_SNAPSHOTS_PER_ROUND
        ? shuffleSample(personaIds, MAX_SNAPSHOTS_PER_ROUND)
        : personaIds;

    const beliefSnapshots: BeliefStateSnapshot[] = sampleIds.map((id) => {
      const bs = agentBeliefs.get(id)!;
      return {
        personaId: id,
        positions: { ...bs.positions },
        confidence: { ...bs.confidence },
        trust: { ...bs.trust },
        exposureCount: 0,
      };
    });

    const convergence = this.computeConvergence(round.opinionSnapshot);

    this.trajectoryRounds.push({
      roundNumber: round.roundNumber,
      avgOpinion: round.avgOpinion,
      beliefSnapshots,
      convergenceScore: convergence,
    });

    this.previousAvgOpinion = round.avgOpinion;
  }

  // Skala zbieżności: odchylenie standardowe opinii → normalizowane do 0..1
  // (0 = duże rozproszenie / chaos, 1 = wszyscy myślą tak samo)
  private computeConvergence(opinionSnapshot: Record<string, number>): number {
    const values = Object.values(opinionSnapshot);
    if (values.length < 2) return 1.0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);

    // Max std na skali -10..+10 wynosi ~10; normalizujemy odwrotnie
    return Math.max(0, 1 - std / 10);
  }

  // Punkty zwrotne: rundy z gwałtowną zmianą średniej opinii
  findTurningPoints(topN = 3): TurningPoint[] {
    if (this.trajectoryRounds.length < 2) return [];

    const deltas: Array<{ roundNumber: number; delta: number }> = [];
    for (let i = 1; i < this.trajectoryRounds.length; i++) {
      const delta = this.trajectoryRounds[i].avgOpinion - this.trajectoryRounds[i - 1].avgOpinion;
      if (Math.abs(delta) >= TURNING_POINT_THRESHOLD) {
        deltas.push({ roundNumber: this.trajectoryRounds[i].roundNumber, delta });
      }
    }

    return deltas
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, topN)
      .map(({ roundNumber, delta }) => ({
        roundNumber,
        description: delta > 0
          ? `Wzrost poparcia o ${delta.toFixed(2)} pkt`
          : `Spadek poparcia o ${Math.abs(delta).toFixed(2)} pkt`,
        opinionDelta: delta,
      }));
  }

  // Polaryzacja: frakcja agentów na skrajnych biegunach (|opinia| > 6)
  computePolarization(opinionSnapshot: Record<string, number>): number {
    const values = Object.values(opinionSnapshot);
    if (values.length === 0) return 0;
    const extreme = values.filter((v) => Math.abs(v) > 6).length;
    return extreme / values.length;
  }

  toData(finalOpinionSnapshot: Record<string, number>): SimulationTrajectoryData {
    return {
      rounds: this.trajectoryRounds,
      turningPoints: this.findTurningPoints(),
      finalConvergence:
        this.trajectoryRounds.at(-1)?.convergenceScore ?? 0,
      polarizationIndex: this.computePolarization(finalOpinionSnapshot),
    };
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function shuffleSample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
