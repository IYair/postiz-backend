import Anthropic from '@anthropic-ai/sdk';
import { TextProvider, TextOptions, ChatMessage } from '../../ai.interfaces';
import { ZodSchema } from 'zod';

export class ClaudeTextAdapter implements TextProvider {
  private client: Anthropic;

  constructor(private apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  async generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nRespond with valid JSON matching this schema. No extra text.`,
      }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const parsed = JSON.parse(textBlock?.text ?? '{}');
    return schema.parse(parsed);
  }

  async generateChat(messages: ChatMessage[], options?: TextOptions): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystemMsgs = messages.filter((m) => m.role !== 'system');
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature,
      ...(systemMsg && { system: systemMsg.content }),
      messages: nonSystemMsgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }
}
