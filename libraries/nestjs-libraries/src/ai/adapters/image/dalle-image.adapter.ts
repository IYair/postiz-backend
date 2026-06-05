import OpenAI from 'openai';
import { ImageProvider, ImageOptions } from '../../ai.interfaces';
import { DALLE_SIZE_MAP } from '../../ai.types';

export class DallEImageAdapter implements ImageProvider {
  private client: OpenAI;

  constructor(private apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<Buffer> {
    const size = DALLE_SIZE_MAP[options?.aspectRatio ?? 'square'] ?? '1024x1024';
    const response = await this.client.images.generate({
      model: this.model,
      prompt,
      n: 1,
      size: size as any,
    });
    const url = response.data[0]?.url;
    if (!url) throw new Error('DALL-E returned no image URL');
    // Normalize: URL -> fetch -> Buffer
    const imageResponse = await fetch(url);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
}
