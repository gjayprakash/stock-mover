# 4-hour plan

| Time | Jay (data + engine) | Asjad (UI + AI) |
|---|---|---|
| 0:00–0:20 | Workbook into `data/`, open every tab, fill "Open questions" in CLAUDE.md, `scripts/prepare` → derived JSON | `create-next-app`, Tailwind, shadcn, push to GitHub, **deploy empty app to Vercel now** |
| 0:20–1:30 | Velocity + position + Warehouse → store + validator → first real `moves.json` | Screen 1 against `shared/moves.sample.json`: header, tabs, grouped rows, approve/reject |
| 1:30–2:30 | Store → store, ageing, pull back, capacity guard, priority score | Swap to real data, row expand with mini chart + rule ticks, keyboard shortcuts, export CSV |
| 2:30–3:10 | `/api/run` + Vercel Cron, forward uplift from calendar | MeshAPI: morning brief + chat drawer |
| 3:10–3:40 | Walk the hidden-problem checklist, hand-check 5 moves in Excel | Polish, empty/loading states, "Found problems" cards if time |
| 3:40–4:00 | **Freeze.** Final deploy, rehearse demo twice | same |

## Rules of the day
- Deploy in the first 20 minutes and after every milestone. Never demo from localhost.
- The contract is `shared/moves.schema.md`. UI never waits for the engine.
- Something taking over 20 minutes longer than planned → cut it, move on.

## Cut order if we run late (cut from the top)
1. "Found problems" screen  2. Forward uplift  3. Chat (keep the brief)  4. Mini chart in row expand  5. Keyboard shortcuts
Never cut: validator, reason lines, in-stock-day velocity, the scheduled run, export.

## 3-minute demo script
1. "It ran at 6am on its own. 118 moves, 0 rule violations." (header)
2. Read the AI brief out loud.
3. Open one stockout move: "zero sales last 3 weeks, the naive answer says slow; it was out of stock 21 days."
4. Open one blocked case: flagship protected style, or donor kept above 30 days.
5. Ageing move: fashion style stuck 130 days, moved to where it sells.
6. Shift+A a store group, export CSV. "Ten minutes, done."
7. Ask the chat one question.
