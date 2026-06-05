import { GoogleGenerativeAI } from '@google/generative-ai';
import { ImageProvider, ImageOptions } from '../../ai.interfaces';
import { GEMINI_ASPECT_MAP } from '../../ai.types';

export class GeminiImageAdapter implements ImageProvider {
  private genAI: GoogleGenerativeAI;

  constructor(private apiKey: string, private model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<Buffer> {
    const aspectRatio =
      GEMINI_ASPECT_MAP[options?.aspectRatio ?? 'square'] ?? '1:1';

    // Gemini native image models (gemini-*-image-*) use generateContent.
    // Multi-turn parts: reference images go BEFORE the text prompt so the
    // model treats them as style/content anchors.
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (options?.referenceImages?.length) {
      for (const ref of options.referenceImages) {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType,
            data: ref.base64,
          },
        });
      }
    }

    parts.push({ text: prompt });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        // @ts-ignore - responseModalities not in SDK types yet
        responseModalities: ['TEXT', 'IMAGE'],
      } as any,
    });

    const imagePart = result.response.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini returned no image data');
    }

    return Buffer.from(imagePart.inlineData.data, 'base64');
  }
}
