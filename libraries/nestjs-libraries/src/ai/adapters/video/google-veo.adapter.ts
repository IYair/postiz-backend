import { GoogleGenAI } from '@google/genai';
import type { IUploadProvider } from '@gitroom/nestjs-libraries/upload/upload.interface';
import {
  VideoProvider,
  VideoOptions,
  VideoGenerationResult,
} from '../../ai.interfaces';
import { VEO_ASPECT_MAP } from '../../ai.types';

const MAX_POLL_ATTEMPTS = 60; // ~10 min a 10s por intento

export class GoogleVeoAdapter implements VideoProvider {
  private ai: GoogleGenAI;

  constructor(
    private apiKey: string,
    private model: string,
    private upload: IUploadProvider,
    private pollIntervalMs = 10000
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateVideo(
    prompt: string,
    options: VideoOptions
  ): Promise<VideoGenerationResult> {
    const aspectRatio = VEO_ASPECT_MAP[options.aspectRatio] ?? '16:9';

    let operation: any = await this.ai.models.generateVideos({
      model: this.model,
      prompt,
      config: {
        aspectRatio,
        numberOfVideos: 1,
      },
    });

    let attempts = 0;
    while (!operation.done) {
      if (attempts++ >= MAX_POLL_ATTEMPTS) {
        throw new Error('Veo video generation timed out');
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      operation = await this.ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new Error(operation.error.message || 'Veo video generation failed');
    }

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      throw new Error('Veo returned no video URI');
    }

    // El archivo de Veo requiere la API key como query param.
    const resp = await fetch(`${uri}&key=${this.apiKey}`);
    if (!(resp as any).ok) {
      throw new Error('Failed to download generated video');
    }
    const buffer = Buffer.from(await resp.arrayBuffer());

    const url = await this.upload.uploadSimple(buffer);
    return { url };
  }
}
