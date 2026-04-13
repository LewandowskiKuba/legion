// ─────────────────────────────────────────────────────────────────────────────
// SimulationStateStore – singleton zarządzający aktywnymi symulacjami
// Aktywne symulacje: in-memory; zakończone: zapis do data/simulations/
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { SimulationOrchestrator } from "./orchestrator.js";
import type { SimulationConfig } from "./schema.js";

const SIMULATIONS_DIR = path.resolve("data/simulations");

if (!existsSync(SIMULATIONS_DIR)) {
  mkdirSync(SIMULATIONS_DIR, { recursive: true });
}

export class SimulationStateStore {
  private active: Map<string, SimulationOrchestrator> = new Map();

  async create(config: SimulationConfig): Promise<SimulationOrchestrator> {
    const orc = new SimulationOrchestrator(config);
    this.active.set(orc.getId(), orc);
    return orc;
  }

  get(id: string): SimulationOrchestrator | undefined {
    if (this.active.has(id)) return this.active.get(id);

    // Próba załadowania z dysku
    const filePath = path.join(SIMULATIONS_DIR, `${id}.json`);
    if (existsSync(filePath)) {
      try {
        const json = readFileSync(filePath, "utf-8");
        const orc = SimulationOrchestrator.deserialize(json);
        this.active.set(id, orc);
        return orc;
      } catch (err) {
        console.error(`⚠ Nie udało się załadować symulacji ${id}:`, (err as Error).message);
      }
    }
    return undefined;
  }

  persist(id: string): void {
    const orc = this.active.get(id);
    if (!orc) return;

    try {
      const filePath = path.join(SIMULATIONS_DIR, `${id}.json`);
      writeFileSync(filePath, orc.serialize(), "utf-8");
    } catch (err) {
      console.error(`⚠ Nie udało się zapisać symulacji ${id}:`, (err as Error).message);
    }
  }

  listAll(): Array<{ id: string; studyName: string; status: string; createdAt: string; totalRounds: number; currentRound: number }> {
    const results: Array<{ id: string; studyName: string; status: string; createdAt: string; totalRounds: number; currentRound: number }> = [];

    // Aktywne
    for (const [id, orc] of this.active.entries()) {
      const s = orc.getState();
      results.push({
        id,
        studyName: s.studyName,
        status: s.status,
        createdAt: s.createdAt,
        totalRounds: s.totalRounds,
        currentRound: s.currentRound,
      });
    }

    // Z dysku (jeśli nie są już w aktywnych)
    try {
      for (const file of readdirSync(SIMULATIONS_DIR)) {
        if (!file.endsWith(".json")) continue;
        const id = file.replace(".json", "");
        if (this.active.has(id)) continue;
        try {
          const raw = readFileSync(path.join(SIMULATIONS_DIR, file), "utf-8");
          const { state } = JSON.parse(raw);
          results.push({
            id,
            studyName: state.studyName,
            status: state.status,
            createdAt: state.createdAt,
            totalRounds: state.totalRounds,
            currentRound: state.currentRound,
          });
        } catch {
          // Pomiń uszkodzone pliki
        }
      }
    } catch {
      // SIMULATIONS_DIR nie istnieje lub problem z odczytem
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// Singleton
export const simulationStore = new SimulationStateStore();
