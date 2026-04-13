// ─────────────────────────────────────────────────────────────────────────────
// AgentMemoryStore – in-memory pamięć agentów per-symulacja
// ─────────────────────────────────────────────────────────────────────────────

import type { MemoryEntry } from "./schema.js";

const MAX_SUMMARY_ENTRIES = 6;  // Ile ostatnich wpisów trafia do summarki (limit tokenów)

export class AgentMemoryStore {
  private store: Map<string, MemoryEntry[]> = new Map();

  add(personaId: string, entry: MemoryEntry): void {
    if (!this.store.has(personaId)) {
      this.store.set(personaId, []);
    }
    this.store.get(personaId)!.push(entry);
  }

  getAll(personaId: string): MemoryEntry[] {
    return this.store.get(personaId) ?? [];
  }

  getRecent(personaId: string, maxEntries = MAX_SUMMARY_ENTRIES): MemoryEntry[] {
    const all = this.store.get(personaId) ?? [];
    return all.slice(-maxEntries);
  }

  // Formatuje pamięć do wstrzyknięcia w system prompt
  getSummary(personaId: string): string {
    const recent = this.getRecent(personaId);
    if (recent.length === 0) return "";

    return recent
      .map((m) => {
        const valence =
          m.emotionalValence === 1 ? "(pozytywnie)" :
          m.emotionalValence === -1 ? "(negatywnie)" : "(neutralnie)";
        const from = m.fromPersonaName ? ` od ${m.fromPersonaName}` : "";
        return `[Runda ${m.round}] ${m.type}${from}: "${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}" ${valence}`;
      })
      .join("\n");
  }

  serialize(): Record<string, MemoryEntry[]> {
    const result: Record<string, MemoryEntry[]> = {};
    for (const [id, entries] of this.store.entries()) {
      result[id] = entries;
    }
    return result;
  }

  static deserialize(data: Record<string, MemoryEntry[]>): AgentMemoryStore {
    const store = new AgentMemoryStore();
    for (const [id, entries] of Object.entries(data)) {
      store.store.set(id, entries);
    }
    return store;
  }
}
