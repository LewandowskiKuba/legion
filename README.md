# Society Reactor

**AI-powered social simulation platform for predicting collective behavior.**

Society Reactor generates synthetic Polish populations and runs multi-round social simulations — modeling how information, narratives and advertisements spread through social networks, and how public opinion forms and evolves.

---

## What it does

You define a scenario — an ad campaign, a news story, a rumor, or competing framings — and Society Reactor simulates how a synthetic population of thousands of agents responds over multiple rounds of social interaction.

Each agent has a full psychological and demographic profile. Agents read content in their feed, form opinions, post, comment, share, and influence each other through a Barabási–Albert social graph. The result is a granular picture of how your message lands — not just overall, but across age groups, political affiliations, personality types and more.

---

## Core capabilities

### Simulation engine
- **Multi-round social dynamics** — agents interact over configurable rounds, opinions shift based on feed exposure, trust networks and prior beliefs
- **Belief state tracking** — per-agent stances, confidence and trust evolve round by round
- **GraphRAG knowledge graph** — brand/topic context injected into agent reasoning
- **Barabási–Albert social graph** — realistic network with hubs and influencers
- **Agent memory** — agents remember past interactions and update accordingly

### Analysis modules

| Module | What it answers |
|---|---|
| **Dual-signal Bayesian A/B** | Which of two creatives wins, and by how much? |
| **Plackett–Luce N-way ranking** | How do 3–5 variants rank against each other? |
| **WoM Competitive Contagion** | Which narrative framing dominates in word-of-mouth spread? |

### Reporting
- **Demographic breakdown** — opinion distribution per age group, gender, education, political affiliation, settlement type
- **Psychographic breakdown** — OCEAN personality, values (traditionalism, collectivism, risk tolerance), trust (institutional, media, brand)
- **Coalition map** — emergent opinion clusters with political and demographic profiles
- **Influencer detection** — agents with highest reach scores per simulation
- **Viral moment tracking** — content that spread furthest and fastest
- **ReportAgent synthesis** — LLM-generated narrative summary and recommendations
- **PDF export** — full study report with all metrics

---

## Tech stack

**Backend** — Node.js · TypeScript · PostgreSQL + pgvector  
**Frontend** — React · Vite · Tailwind · Recharts  
**AI** — OpenAI-compatible API (Qwen via DashScope, configurable)  
**Infrastructure** — Docker Compose · Nginx · Cloudflare

---

## Population model

Synthetic agents are calibrated against Polish census data (GUS/BDL) across:

- **Demographics** — age, gender, education, region (16 voivodeships), settlement type, household type
- **Financials** — income level, savings, debt, price sensitivity
- **Personality** — Big Five (OCEAN) scores
- **Values** — traditionalism, collectivism, risk tolerance
- **Trust** — institutional, media, brand
- **Political** — party affiliation (PiS, KO, TD, Lewica, Konfederacja, undecided, apolitical), EU attitude, engagement level
- **Media habits** — platforms (Facebook, Instagram, TikTok, YouTube, TV), daily hours, communication style preferences

---

## API

| Endpoint | Description |
|---|---|
| `POST /api/simulation` | Start a new simulation |
| `GET /api/simulation/:id` | Get simulation state + demographic/psychographic breakdown |
| `GET /api/simulation/:id/stream` | SSE stream of live round updates |
| `GET /api/simulation/ab-bayesian` | Dual-signal Bayesian A/B comparison |
| `GET /api/simulation/n-way-ranking` | Plackett–Luce ranking for N≥3 simulations |
| `POST /api/event/inject` | Inject an event mid-simulation |

---

## Running locally

```bash
# Backend
cp .env.example .env   # set MODEL_BASE_URL, MODEL_API_KEY, POSTGRES_PASSWORD
npm install
npm run build
npm run web

# Frontend
cd frontend
npm install
npm run dev
```

### With Docker

```bash
docker compose up -d
```

The frontend is served at `/adstest/` and the API at `/api/`.

---

## Project structure

```
src/
├── simulation/        # Core engine: orchestrator, round runner, belief state, social graph
├── personas/          # Population schema, generator, prompt builder
├── engine/            # LLM runner, model router, A/B ranker, spread model
├── reports/           # Bayesian, Plackett–Luce, demographic/psychographic breakdown, PDF
├── db/                # PostgreSQL persistence
└── server.ts          # HTTP API

frontend/
└── src/app/
    ├── pages/         # SimulationView, NewSimulation, Dashboard, Compare
    └── components/    # SocialGraph, FrameCompetitionChart, DemographicBreakdown, ...
```

---

## License

Private — all rights reserved.
