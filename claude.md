# TRAVIS

AI-powered dynamic UI platform for crypto traders. Natural language input → AI assembles real-time interactive market views on a 2D canvas.

## Docs

- `docs/PRD.md` — Product requirements, milestones, registries, component action system
- `docs/ARCHITECTURE.md` — Data flow, system design, extension patterns
- `docs/DB_SCHEMA.md` — Database tables (added incrementally)

Read the relevant doc before working on a feature.

## Tech stack

Next.js 16 (App Router), TypeScript, React Flow (@xyflow/react), shadcn/UI (Tailwind v4), Zustand, Zod, Supabase, Claude API (Haiku + Sonnet), Hetzner (data workers), Vercel

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run type-check
```

## Code style

- Functional components only
- Named exports (except page.tsx, layout.tsx)
- Zustand for shared state, not React Context — Zustand hooks are client-only, never use in Server Components
- All AI output validated with Zod
- Supabase RLS on every user-specific table

## Architecture rules

- **3 data paths**: Hetzner WS relay (price/orderbook ticks), Supabase Realtime (everything else), AI JSON (view config)
- **Tick data never goes through Supabase** — WS relay to frontend directly
- **All non-tick data stored in Supabase** — single source of truth for AI queries
- **4 registries** (exchange, datasource, component, interaction): register new item → AI uses it automatically, no orchestrator changes
- **No hardcoded AI mappings** — AI reads registries at runtime

## Lessons

<!-- When Claude makes a mistake, add a rule here: "Do X instead of Y" -->