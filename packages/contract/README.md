# @sm/contract — engine ↔ API ↔ UI contract (v2)

- `index.d.ts`: every shared shape (`MovesFile`, `Move`, `Problem`, `StoreSummary`, `Blocked`, `HistoryFile`, `RunRow`, `AiCall`, `BriefResponse`). Types only, nothing emitted.
- `moves.sample.json`: valid `MovesFile`, real IDs from `data/csv`, made-up numbers. Build UI against it until the engine lands.
- `history.sample.json`: 12 weeks per `"STORE|SKU"` pair used in the sample moves.

```ts
import type { MovesFile } from '@sm/contract';
import sample from '@sm/contract/moves.sample.json';
```

Changing a field? Tell the other lanes and update the types and both samples in the same PR.
`moves.json` must stay small; per-row charts go in `history.json`.
