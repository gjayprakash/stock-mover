# MeshAPI (https://developers.meshapi.ai/)

OpenAI-compatible gateway. One key for many models.
- Base URL: `https://api.meshapi.ai/v1`
- Auth: `Authorization: Bearer rsk_...` (Router Service Key)
- Chat: `POST /v1/chat/completions`. Model IDs are provider-prefixed, e.g. `openai/gpt-4o`. Full list: https://meshapi.ai/models
- Docs index for anything else (streaming, tools, structured output): https://developers.meshapi.ai/llms.txt

```ts
// lib/ai.ts  (server only)
import OpenAI from "openai";
export const ai = new OpenAI({
  apiKey: process.env.MESH_API_KEY!,
  baseURL: "https://api.meshapi.ai/v1",
});
export const MODEL = process.env.MESH_MODEL ?? "openai/gpt-4o";
```

## Rules for using AI here
- Key stays in `.env.local` / Vercel env vars. Never in client code, never committed.
- The model receives our computed JSON and only rephrases or answers from it. System prompt:
  "Use only the numbers in the provided data. If it isn't there, say you don't have it."
- If the AI call fails, the page still works (brief card hides). The demo cannot depend on it.

## The only three AI features
1. **Morning brief** (`/api/brief`): input = summary + top 15 moves + flags → 4–5 line plain-English brief. Cache per run.
2. **Ask Stock Mover** (`/api/chat`): input = question + compact moves.json (+ store/SKU positions for anything named in the question). Stream the answer.
3. Nothing else. Reason lines are templates.
