import { GoogleGenerativeAI } from '@google/generative-ai';
import { TextProvider, TextOptions, ChatMessage } from '../../ai.interfaces';
import { ZodSchema } from 'zod';

export class GeminiTextAdapter implements TextProvider {
  private genAI: GoogleGenerativeAI;

  constructor(private apiKey: string, private model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async generateStructured<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(
      `${prompt}\n\nRespond with valid JSON matching this schema. No extra text.`
    );
    const parsed = JSON.parse(result.response.text());
    return schema.parse(parsed);
  }

  async generateChat(messages: ChatMessage[], options?: TextOptions): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    });
    const systemMsg = messages.find((m) => m.role === 'system');
    const history = messages
      .filter((m) => m.role !== 'system')
      .slice(0, -1)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const lastMsg = messages[messages.length - 1];
    const chat = model.startChat({
      history: history as any,
      ...(systemMsg && {
        systemInstruction: { role: 'system', parts: [{ text: systemMsg.content }] },
      }),
    });
    const result = await chat.sendMessage(lastMsg.content);
    return result.response.text();
  }
}
