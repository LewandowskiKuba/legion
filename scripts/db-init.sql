-- ─────────────────────────────────────────────────────────────────────────────
-- We Are Legion – inicjalizacja bazy (uruchamiane automatycznie przy starcie)
-- ─────────────────────────────────────────────────────────────────────────────

-- Włącz pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Agenci (persistent personas) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personas (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    data        JSONB NOT NULL,             -- pełny profil Persona
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pamięć agentów (episodic memory z embeddingami) ──────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
    id              BIGSERIAL PRIMARY KEY,
    persona_id      TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    simulation_id   TEXT,
    round           INT,
    type            TEXT NOT NULL,
    content         TEXT NOT NULL,
    emotional_valence SMALLINT DEFAULT 0,   -- -1, 0, 1
    embedding       vector(1536),           -- OpenAI/Claude embedding (opcjonalne)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_memory_persona_idx ON agent_memory(persona_id);
CREATE INDEX IF NOT EXISTS agent_memory_sim_idx ON agent_memory(simulation_id);
-- pgvector HNSW index dla similarity search (aktywuj gdy będą embeddingi)
-- CREATE INDEX IF NOT EXISTS agent_memory_embedding_idx
--     ON agent_memory USING hnsw (embedding vector_cosine_ops);

-- ── Symulacje ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulations (
    id              TEXT PRIMARY KEY,
    study_name      TEXT,
    status          TEXT NOT NULL DEFAULT 'initializing',
    config          JSONB,
    state           JSONB,                  -- pełny SimulationState
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS simulations_status_idx ON simulations(status);
CREATE INDEX IF NOT EXISTS simulations_created_idx ON simulations(created_at DESC);

-- ── Belief snapshots (per-round per-agent) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS belief_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    simulation_id   TEXT NOT NULL,
    persona_id      TEXT NOT NULL,
    round           INT NOT NULL,
    positions       JSONB,
    confidence      JSONB,
    trust           JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS belief_sim_round_idx ON belief_snapshots(simulation_id, round);
