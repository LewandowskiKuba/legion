// ─────────────────────────────────────────────────────────────────────────────
// AgentMemoryStore – in-memory pamięć agentów per-symulacja
//
// Sliding-window compaction (MiroShark pattern):
//   Gdy liczba wpisów przekroczy MAX_ENTRIES_BEFORE_COMPACT:
//   - stare wpisy (wszystkie poza ostatnimi RECENT_KEEP) → podsumowanie LLM
//   - podsumowanie zapisane jako wpis type="summary"
//   - stare wpisy usunięte
//
//   RECENT_KEEP wpisów zawsze przechowywanych w pełnej formie.
//   getSummary() zwraca: skompaktowane podsumowanie (jeśli istnieje) + ostatnie RECENT_KEEP wpisów.
// ─────────────────────────────────────────────────────────────────────────────

import type { MemoryEntry } from "./schema.js";
import { callSmartModel } from "../engine/runner.js";

const MAX_SUMMARY_ENTRIES = 6;   // Ile ostatnich wpisów w getSummary()
const MAX_ENTRIES_BEFORE_COMPACT = 20;  // Ile wpisów zanim uruchomi się compaction
const RECENT_KEEP = 6;           // Ile wpisów zostaje po compaction

export class AgentMemoryStore {
  private store: Map<string, MemoryEntry[]> = new Map();
  // Skompaktowane podsumowania per persona (zastępują stare rundy)
  private compactedSummaries: Map<string, string> = new Map();

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
  // Jeśli istnieje skompaktowane podsumowanie → dołącz je przed najnowszymi wpisami
  getSummary(personaId: string): string {
    const lines: string[] = [];

    const compacted = this.compactedSummaries.get(personaId);
    if (compacted) {
      lines.push(`[PODSUMOWANIE POPRZEDNICH RUND]: ${compacted}`);
    }

    const recent = this.getRecent(personaId);
    if (recent.length === 0 && !compacted) return "";

    for (const m of recent) {
      const valence =
        m.emotionalValence === 1 ? "(pozytywnie)" :
        m.emotionalValence === -1 ? "(negatywnie)" : "(neutralnie)";
      const from = m.fromPersonaName ? ` od ${m.fromPersonaName}` : "";
      lines.push(`[Runda ${m.round}] ${m.type}${from}: "${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}" ${valence}`);
    }

    return lines.join("\n");
  }

  // Czy agent kwalifikuje się do compaction?
  needsCompaction(personaId: string): boolean {
    return (this.store.get(personaId)?.length ?? 0) > MAX_ENTRIES_BEFORE_COMPACT;
  }

  // Uruchom LLM compaction dla jednej persony
  // Stare wpisy → podsumowanie → usuń, zachowaj RECENT_KEEP
  async compactMemory(personaId: string, personaName: string): Promise<void> {
    const all = this.store.get(personaId) ?? [];
    if (all.length <= MAX_ENTRIES_BEFORE_COMPACT) return;

    const toCompact = all.slice(0, -RECENT_KEEP);
    const toKeep = all.slice(-RECENT_KEEP);

    const entriesText = toCompact
      .map((m) => {
        const from = m.fromPersonaName ? ` od ${m.fromPersonaName}` : "";
        return `[Runda ${m.round}] ${m.type}${from}: ${m.content.slice(0, 120)}`;
      })
      .join("\n");

    try {
      const summary = await callSmartModel(
        `Jesteś pomocnikiem tworzącym zwięzłe podsumowania historii agenta w symulacji społecznej. Piszesz po polsku. Odpowiadasz jednym zwartym akapitem (max 3 zdania).`,
        `Stwórz zwięzłe podsumowanie historii agenta "${personaName}" na podstawie poniższych wpisów pamięci. Uwzględnij kluczowe zdarzenia, dominujące emocje i zmiany opinii.\n\n${entriesText}`,
        200
      );

      // Połącz z istniejącym podsumowaniem jeśli jest
      const existing = this.compactedSummaries.get(personaId);
      this.compactedSummaries.set(
        personaId,
        existing ? `${existing} | ${summary.trim()}` : summary.trim()
      );

      this.store.set(personaId, toKeep);
      console.log(`🗜 Compaction: ${personaName} (${toCompact.length} wpisów → podsumowanie)`);
    } catch (err) {
      console.warn(`⚠ Compaction failed dla ${personaName}:`, (err as Error).message);
      // Fallback: przycinamy mechanicznie bez LLM
      this.store.set(personaId, toKeep);
    }
  }

  // Uruchom compaction dla wszystkich agentów które tego potrzebują (w tle po rundzie)
  async compactAll(population: Array<{ id: string; name: string }>): Promise<void> {
    const candidates = population.filter((p) => this.needsCompaction(p.id));
    if (candidates.length === 0) return;

    console.log(`🗜 Uruchamiam compaction dla ${candidates.length} agentów...`);
    await Promise.all(candidates.map((p) => this.compactMemory(p.id, p.name)));
  }

  serialize(): Record<string, MemoryEntry[]> {
    const result: Record<string, MemoryEntry[]> = {};
    for (const [id, entries] of this.store.entries()) {
      result[id] = entries;
    }
    return result;
  }

  serializeCompacted(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [id, summary] of this.compactedSummaries.entries()) {
      result[id] = summary;
    }
    return result;
  }

  static deserialize(
    data: Record<string, MemoryEntry[]>,
    compacted: Record<string, string> = {}
  ): AgentMemoryStore {
    const store = new AgentMemoryStore();
    for (const [id, entries] of Object.entries(data)) {
      store.store.set(id, entries);
    }
    for (const [id, summary] of Object.entries(compacted)) {
      store.compactedSummaries.set(id, summary);
    }
    return store;
  }
}
