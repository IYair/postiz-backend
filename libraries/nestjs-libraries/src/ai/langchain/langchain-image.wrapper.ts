import { ImageProvider, ImageOptions } from '../ai.interfaces';

export class LangChainImageWrapper {
  constructor(private imageProvider: ImageProvider) {}

  async run(prompt: string): Promise<string> {
    const buffer = await this.imageProvider.generateImage(prompt, {
      aspectRatio: 'square',
    });
    return buffer.toString('base64');
  }
}
