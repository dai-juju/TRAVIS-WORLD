# TRAVIS

AI-powered dynamic UI platform for crypto traders. Natural language input → AI assembles real-time interactive market views on an infinite 2D canvas.

> "Shape your market."

TRAVIS is a **trading workflow tool** — not a screener, not a chatbot, not a research tool. Every query produces a personalized live view, not a text answer.

## Docs

Read the relevant doc before starting work on a feature — do not guess.

- `docs/PRD.md` — Product requirements, registries, component action system
- `docs/ARCHITECTURE.md` — Data flow, system design, extension patterns
- `docs/DB_SCHEMA.md` — Supabase table schemas (grows incrementally as features land)

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), TypeScript, React Flow (@xyflow/react 12), shadcn/UI (Tailwind v4), Zustand |
| AI | Claude API (Haiku 4.5 primary, Sonnet 4.6 escalation), Zod |
| Database | Supabase (DB + Auth + Realtime + Edge Functions) |
| Search fallback | Tavily (on-demand web search, ~5% of queries) |
| Data workers | Hetzner VPS (Node.js/TypeScript) |
| Hosting | Vercel |
| Language | English only (global target) |

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
```

## Architecture — quick reference

Full details in `docs/ARCHITECTURE.md`. These rules are non-negotiable:

### 3 deployment units (independent, connected via Supabase)

- **Vercel** — Next.js frontend + API Routes (AI orchestrator lives here)
- **Hetzner VPS** — Data collection workers + WS relay server
- **Supabase** — DB + Auth + Realtime + Edge Functions

### 3 data paths (all active simultaneously)

- **Path A — WS streaming (true realtime):** Exchange WS → Hetzner adapter → WS relay → Frontend direct. **Never routes through Supabase** — DB write + Realtime broadcast latency is unacceptable for streaming data.
- **Path B — Polling + persistence (near-realtime):** Data sources (exchange REST, CoinGecko, CoinGlass, news, on-chain, etc.) → Hetzner polling (5s–5min) → Supabase DB upsert → Supabase Realtime → Frontend. Supabase is the single source of truth for all polled data.
- **Path C — AI commands:** User query → Vercel API Route → AI orchestrator → Supabase validation query → JSON view config → Frontend renders cards with live subscriptions (Path A or B).

Streaming data = Path A. Polled data = Path B. Do not mix them.

### AI orchestrator

- **Routing:** User input → Haiku first (intent classification, registry selection). Simple queries complete here. Complex queries only → Sonnet (multi-source combos, cross-exchange, ambiguous intent).
- **Flow:** 1) Receive input → 2) Call Haiku with registries injected into system prompt → 3) AI outputs JSON → 4) Zod-validate; on failure, feed the Zod error back to AI and retry **once** → 5) Graceful fallback UI if it still fails — **never crash**.
- **Log every validation failure** for prompt improvement.
- **No hardcoded mappings.** AI reads the 4 registries at runtime and decides the component + datasource + interaction combo per query. The same query from different users/contexts may legitimately produce different views.

### 4 registries (same extension pattern)

Register new entry → AI auto-discovers via system-prompt injection. **No orchestrator code changes needed, ever.**

1. **Exchange adapter** — Common REST + WS interface. Market types (`spot`, `futures`, `options`, `alpha`) declared as array per adapter. All adapters normalize to a common output format.
2. **Datasource** — Available data sources, schemas, refresh intervals, query capabilities.
3. **Component** — UI components, required data shapes, supported sizes, supported interactions.
4. **Interaction** — Available interaction types. Components declare which they support; AI picks per context.

| Adding | Required work |
|--------|---------------|
| New exchange | Implement adapter interface + register |
| New asset class (e.g. options) | Add market type to existing adapter + implement methods |
| New component | Build React component + register |
| New datasource | Collection logic + Supabase table + register |
| New interaction | Implement handler + register |

### Component action system

AI writes a per-card `actions` field in output JSON. The frontend action dispatcher reads the type and executes:

- **Spawn** — Click element → new card appears on canvas with its own data subscription.
- **Drill-down** — Click element → same card transitions to a deeper view (with back-navigation stack).

New interaction types: implement handler + register in the interaction registry. AI picks it up automatically.

## Code style

- **Functional components only.** Use `react-error-boundary` for Error Boundaries.
- **Named exports** everywhere except `page.tsx` and `layout.tsx`.
- **Zustand for shared/global state.** Zustand hooks are client-only — **never use in Server Components**. React Context is allowed only for rarely-changing values (auth, theme).
- **All AI output validated with Zod.** On validation failure → retry once with the Zod error fed back to AI → graceful fallback UI. Never crash. Log all failures.
- **Supabase RLS on every user-specific table** (`auth.uid() = user_id`). CI enforces an RLS check to prevent missed tables on migration.
- **Each card manages its own data subscription** — WS streaming via Hetzner WS relay, polling data via Supabase Realtime. Do not centralize subscriptions.

## Security (non-negotiable)

- User exchange API keys: encrypted in Supabase, decrypted **only** in Edge Functions, **read-only queries only** (positions / balances / PnL).
- **TRAVIS never executes trades.** Ever. Not even "just for testing."
- Environment variables are never exposed to the frontend.
- RLS enforced on all `user_*` and `log_*` tables.

## Exchanges

**MVP:** Binance, OKX, Bybit, Bitget — spot + futures each (8 connections total).

## Gotchas (do NOT do these)

- ❌ Do **not** route streaming data (trades, orderbook, ticker, liquidation, etc.) through Supabase. Use Path A — Hetzner WS relay → frontend direct.
- ❌ Do **not** hardcode datasource / component / interaction mappings inside the orchestrator. Always register and let the AI pick at runtime.
- ❌ Do **not** create a `user_*` or `log_*` table without an RLS policy. CI will reject the migration.
- ❌ Do **not** use Zustand hooks in Server Components — they are client-only.
- ❌ Do **not** implement trade execution anywhere. TRAVIS is read-only; this is a compliance boundary, not a preference.
- ❌ Do **not** let AI validation failures crash the UI — retry once, then fall back gracefully.
- ❌ Windows dev environment uses Git Bash (not PowerShell). Use Unix shell syntax (`/dev/null`, forward slashes in paths).

## Lessons

<!-- When Claude makes a repeated mistake, append a concrete rule here:
     "Do X instead of Y — reason: <incident>".
     HTML comments are stripped from Claude's context per Claude Code docs,
     so this block costs zero tokens but helps human maintainers. -->
