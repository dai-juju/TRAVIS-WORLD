# TRAVIS

AI-powered dynamic UI platform for crypto traders. Natural language input → AI assembles real-time interactive market views on a 2D canvas.

## Docs

- `docs/PRD.md` — Product requirements, milestones, registries, component action system
- `docs/ARCHITECTURE.md` — Data flow, system design, extension patterns
- `docs/DB_SCHEMA.md` — Database tables (added incrementally)

Read the relevant doc before working on a feature.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), TypeScript, React Flow (@xyflow/react 12), shadcn/UI (Tailwind v4), Zustand |
| AI | Claude API (Haiku 4.5 + Sonnet 4.6), Zod |
| Database | Supabase (DB + Auth + Realtime + Edge Functions) |
| Search | Tavily (on-demand web search fallback, ~5% of queries) |
| Data workers | Hetzner VPS (Node.js/TypeScript) |
| Hosting | Vercel |
| Language | English only (global target) |

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run type-check
```

## Code style

- Functional components only (use `react-error-boundary` for Error Boundaries)
- Named exports (except page.tsx, layout.tsx)
- Zustand for shared/global state — Zustand hooks are client-only, never use in Server Components. React Context allowed only for rarely-changing values (auth, theme)
- All AI output validated with Zod — on validation failure, retry once with Zod error message fed back to AI → graceful fallback UI, never crash. Log all validation failures for prompt improvement
- Supabase RLS on every user-specific table (`auth.uid() = user_id`) — enforce RLS check in CI to prevent missed tables on migration

## Architecture rules

### 3 deployment units

Vercel (frontend + API Route), Hetzner VPS (data workers + WS relay), Supabase (DB + Auth + Realtime + Edge Functions) — deployed independently, connected through Supabase.

### 3 data paths (all active simultaneously)

- **Path A — WS streaming (true realtime):** Exchange WS → Hetzner adapter → WS relay → Frontend direct. All data types supported by each exchange's WebSocket API (trades, orderbook, ticker, kline, funding rate, liquidation, etc.). **Does not route through Supabase** — direct relay for lowest latency.
- **Path B — Polling + persistence (near-realtime):** Data sources (exchange REST, CoinGecko, CoinMarketCap, CoinGlass, news, on-chain etc..) → Hetzner polling (5s–5min intervals) → Supabase DB (upsert) → Supabase Realtime → Frontend. Supabase is the single source of truth — AI queries any data combination from one place.
- **Path C — AI commands:** User query → Vercel API Route → AI orchestrator → Supabase data validation query → JSON view config → Frontend renders cards with live data subscriptions (Path A or B).

### AI orchestrator

- **Routing:** User input → Haiku (fast, cheap): intent classification, datasource/component/interaction selection → simple queries complete here. Complex queries only → Sonnet (accurate, expensive): multi-source combos, cross-exchange comparison, ambiguous intent.
- **Processing flow:** 1) Receive input → 2) Call Haiku with registries in system prompt → 3) Haiku classifies intent + judges complexity → 4) Zod-validate output JSON; on failure, feed Zod error back to AI and retry once → 5) Return to frontend.
- **No hardcoded mappings** — AI reads 4 registries at runtime and decides component + datasource + interaction combos per query. Same query from different users/contexts may produce different views.

### 4 registries (same pattern: register → AI auto-discovers, no orchestrator changes)

1. **Exchange adapter** — Common interface for REST (polling) + WS (streaming). Market types declared as array per adapter (`spot`, `futures`, `options`, `alpha`). All adapters normalize to common output format.
2. **Datasource** — Available data sources, schemas, refresh intervals, query capabilities.
3. **Component** — UI components, required data shapes, supported sizes, supported interactions.
4. **Interaction** — Available interaction types. Components declare which they support; AI picks per context.

### Component action system

AI defines per-card `actions` in output JSON. Frontend action dispatcher reads action type and executes:

- **Spawn:** Click element → new card appears on canvas with its own data subscription.
- **Drill-down:** Click element → same card transitions to deeper view (with back-navigation stack).

New interaction types: implement handler + register in interaction registry.

### Frontend

- React Flow infinite 2D canvas — all cards are custom nodes
- Card = common container (drag, resize, delete, header) + dynamically rendered registry component inside
- Each card manages its own data subscription (WS streaming → Hetzner WS relay, polling data → Supabase Realtime)
- Zustand stores: canvas (nodes/viewport), chat (messages/input), views (saved view list)

### Extension pattern

| Adding | Steps |
|--------|-------|
| New exchange | Implement adapter interface + register |
| New asset class | Add market type to existing adapter + implement methods |
| New component | Build React component + register |
| New datasource | Collection logic + Supabase table + register |
| New interaction | Implement handler + register |

No orchestrator code changes needed for any extension.

### Security

- User exchange API keys: encrypted in Supabase, decrypted only in Edge Functions, read-only queries only — **TRAVIS never executes trades**
- Environment variables never exposed to frontend
- All user-specific tables: RLS enforced

## Current milestone: M1 — Foundation + Core Loop

**Goal:** "Natural language input → AI determines intent → card renders on canvas" end-to-end.

- Next.js 16 + React Flow canvas + bottom chat input bar + Zustand global state
- AI orchestrator with Haiku + initial registry entries + Zod validation + Sonnet escalation flag (actual Sonnet routing in M3)
- Hetzner worker basic setup, single exchange connection (Binance)
- Supabase Auth (email) + user log tables (chat log, behavior log) with RLS
- All 4 registries + exchange adapter pattern + action dispatcher (basic spawn)
- Vercel + Hetzner deploy, GitHub repo + basic CI

## Exchanges

MVP: Binance, OKX, Bybit, Bitget — spot + futures each (8 connections total).

## Lessons

<!-- When Claude makes a mistake, add a rule here: "Do X instead of Y" -->
