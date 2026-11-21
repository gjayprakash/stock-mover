# Stock Mover — shared context (read fully before doing anything)

## What we are building
Hackathon MVP for Vedant Fashions (Manyavar), Case study B "Stock Mover".
A tool that runs daily, finds misplaced stock across 20 stores + 1 warehouse (WH-KOL),
and outputs a ready-to-approve move list. A merchandiser must be able to approve it
in 10 minutes and every move must make sense. Full brief: `docs/01-brief.md`.

## Hard constraints
- 4 hours total, then it must be LIVE. MVP only. If it is not on the plan, do not build it.
- Deterministic engine decides every move and every number. AI never invents numbers.
- AI goes through MeshAPI only (OpenAI-compatible, see `docs/04-meshapi.md`).
- Zero rule violations in the output. A validator re-checks every move before it is shown.
- No tests of any kind. No unit, integration, or e2e tests, no TDD or test-first workflows,
  and no test files or test setup. (The runtime validator is part of the product, not a test.)

## The five rules (never break)
1. Every store keeps minimum display per category (`min_display` tab); never exceed `stock_capacity_units`.
2. S++ flagships never give away their top-20 styles (`flagship_protected` tab).
3. In-transit stock counts as arriving. Never send it twice.
4. No store → store move may leave the giving store under 30 days of cover.
5. Ignore transport cost, respect lead times (`lead_times` tab). Every move has a one-line reason.

## How we are judged (optimise for exactly this)
- They hid stock problems in the data and check if we found them. See trap list in `docs/02-engine.md`.
- They spot-check numbers and check no rule is broken.
- They check it runs on its own (scheduled daily run, no button pushing).
- "Zero sales isn't always a slow product" → velocity must be based on in-stock days.

## Decisions already made (do not reopen)
- npm-workspaces monorepo: `apps/web` (React + Vite + TypeScript + Tailwind) and `apps/api` (NestJS).
  Postgres on Neon (project `stock-mover`, Singapore) via `pg`, `DATABASE_URL` env var.
  Deployed on Render as ONE web service (`render.yaml`): Nest serves the built web app and `/api/*`.
  Local: `npm install`, put `DATABASE_URL` in `.env`/shell, `npm run dev` (web :5173 proxies `/api` to :3000).
- Data: workbook → `scripts/prepare` → small JSON in `data/derived/`. Engine is pure TypeScript in `apps/api/src/engine/`.
- Engine output is one file, `moves.json`, shaped as in `packages/contract/index.d.ts` (`@sm/contract`). UI reads only that.
- Approvals live in the browser (localStorage) + "Export approved CSV". No auth, no users.
- Daily run = GitHub Actions schedule hitting `POST /api/run` (Render cron jobs are not free). UI shows last run and next run.
- AI (MeshAPI) does three things only: morning brief, "Ask Stock Mover" chat grounded in moves.json, polishing nothing else.
- Reason lines are built from templates with real numbers, not written by the LLM.

## Out of scope (say no)
Login, roles, database, transport cost, multi-day planning, forecasting models beyond
simple rates, mobile layout, settings pages, salesperson/roster/footfall analysis
(those tabs belong to other case studies; we do not need them).

## Conventions
- IDs exactly as in the data: `store_id` (LKO-01), `sku_id` (KUR-12-XL), `style_id` (KUR-12), warehouse `WH-KOL`.
- As-of date is 2026-10-31 (close of day). "Today" in the product = 2026-11-01.
- Money in ₹ including GST. Quantities are whole units.
- Owners: Jay = data + engine + cron. Asjad = UI + MeshAPI. Swap freely, but update `TASKS.md`.
- When you make a decision the other person needs, add one line under "Decision log" below.

## Decision log
- (add: time, who, decision)
- 2026-11-21, Jay: switched stack from Next.js/Vercel/no-DB to React Vite + NestJS + Neon Postgres on Render. Daily run = Render cron (to wire) hitting `/api/run`.
- 2026-11-21, Jay: contract v2 in `packages/contract` (`@sm/contract`, types-only `index.d.ts` + samples). Adds run_id/status, needs_signoff, problems[], stores[], blocked, DATA_COUNT_MISMATCH flag, HistoryFile, RunRow, AiCall, BriefResponse. Engine lives in `apps/api/src/engine/`; `runEngine(input)` signature is the Jay-A/Jay-B contract.

## Open questions (resolve as soon as the workbook is opened)
- Exact column names in `rules`, `min_display`, `lead_times` tabs (the brief does not list them).
- Does `rules` define target cover / ageing thresholds? If yes, use theirs, not our defaults.
- Are there returns / negative qty in `bill_lines`?
