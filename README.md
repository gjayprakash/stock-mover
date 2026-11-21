# Stock Mover — Vedant Fashions (Manyavar) AI Hackathon, Case study B

Team: Jay + Asjad. Time box: 4 hours. Goal: a live MVP that impresses, nothing more.

**One line:** every day, find stock in the wrong place and give the merchandiser a
ready-to-approve list of moves (warehouse → store, store → store, pull back),
each explained in one line, with zero rule violations.

## Start here
| File | Read it when |
|---|---|
| `CLAUDE.md` | Always. Shared context for both of us and for our Claude sessions |
| `docs/01-brief.md` | You need the problem, rules, or data dictionary |
| `docs/02-engine.md` | You are working on the logic (velocity, cover, moves, validator) |
| `docs/03-ui.md` | You are working on the screens |
| `docs/04-meshapi.md` | You are wiring the AI |
| `docs/05-plan.md` | You want to know what to do right now and what we cut |
| `shared/moves.schema.md` | The contract between engine and UI. Do not change without telling the other person |
| `TASKS.md` | Live checklist with owners. Tick things off here |
| `docs/claude-project/` | Context for the claude.ai Project: `instructions.md` → Project instructions, `knowledge.md` → Project knowledge |

## Sharing between Jay and Asjad
This folder lives on Jay's Desktop. To share: `git init`, push to a private GitHub
repo, add Asjad. Both of us open the repo with Claude so `CLAUDE.md` loads automatically.
Put the dataset in `data/` (see `data/README.md`). Never commit the MeshAPI key.
