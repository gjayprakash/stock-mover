import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Completion = { text: string; tokens_in?: number; tokens_out?: number };

// MeshAPI = OpenAI-compatible gateway (docs/04-meshapi.md). The key stays server-side and is never logged.
@Injectable()
export class MeshClient {
  readonly model = process.env.MESH_MODEL ?? 'openai/gpt-4o';
  private readonly client = process.env.MESH_API_KEY
    ? new OpenAI({
        apiKey: process.env.MESH_API_KEY,
        // Override only for local manual checks against a fake server.
        baseURL: process.env.MESH_BASE_URL ?? 'https://api.meshapi.ai/v1',
        timeout: 20_000,
        maxRetries: 0,
      })
    : null;

  get available() {
    return this.client !== null;
  }

  async complete(messages: ChatMessage[]): Promise<Completion> {
    if (!this.client) throw new Error('MESH_API_KEY is not set');
    const r = await this.client.chat.completions.create({ model: this.model, messages, temperature: 0.2 });
    return {
      text: r.choices[0]?.message?.content?.trim() ?? '',
      tokens_in: r.usage?.prompt_tokens,
      tokens_out: r.usage?.completion_tokens,
    };
  }

  /** Streams text chunks to onChunk and resolves with the full text. */
  async stream(messages: ChatMessage[], onChunk: (text: string) => void): Promise<Completion> {
    if (!this.client) throw new Error('MESH_API_KEY is not set');
    const s = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    });
    let text = '';
    let usage: OpenAI.CompletionUsage | undefined;
    for await (const part of s) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        onChunk(delta);
      }
      if (part.usage) usage = part.usage;
    }
    return { text: text.trim(), tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens };
  }
}
