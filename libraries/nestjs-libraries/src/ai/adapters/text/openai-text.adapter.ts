import OpenAI from 'openai';
import { TextProvider, TextOptions, ChatMessage } from '../../ai.interfaces';
import { ZodSchema } from 'zod';

export class OpenAITextAdapter implements TextProvider {
  private client: OpenAI;

  constructor(private apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nRespond with valid JSON matching this schema. No extra text.`,
      }],
      response_format: { type: 'json_object' },
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    return schema.parse(parsed);
  }

  async generateChat(messages: ChatMessage[], options?: TextOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
