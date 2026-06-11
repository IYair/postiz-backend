import { GoogleGenAI } from '@google/genai';
import type { IUploadProvider } from '@gitroom/nestjs-libraries/upload/upload.interface';
import {
  VideoProvider,
  VideoOptions,
  VideoGenerationResult,
  ImageReference,
} from '../../ai.interfaces';
import { VEO_ASPECT_MAP } from '../../ai.types';

const MAX_POLL_ATTEMPTS = 60; // ~10 min a 10s por intento

function toImage(ref: ImageReference) {
  return { imageBytes: ref.base64, mimeType: ref.mimeType };
}

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
    const config: any = {
      aspectRatio: VEO_ASPECT_MAP[options.aspectRatio] ?? '16:9',
      numberOfVideos: options.numberOfVideos ?? 1,
    };
    if (options.durationSeconds) config.durationSeconds = options.durationSeconds;
    if (options.seed != null) config.seed = options.seed;
    if (options.negativePrompt) config.negativePrompt = options.negativePrompt;

    const params: any = { model: this.model, prompt, config };

    // referenceImages y lastFrame son features de Veo 3.1+; con veo-3.0 la
    // operacion termina "done" sin videos y sin razon clara. Fallar temprano.
    const isVeo30 = this.model.startsWith('veo-3.0');
    if (options.referenceImages?.length && isVeo30) {
      throw new Error(
        `Model ${this.model} does not support reference images (ingredients). Select Veo 3.1 in Settings → AI provider.`
      );
    }
    if (options.endImage && isVeo30) {
      throw new Error(
        `Model ${this.model} does not support an end frame. Select Veo 3.1 in Settings → AI provider.`
      );
    }

    // referenceImages (ingredientes) es excluyente con image/lastFrame.
    if (options.referenceImages?.length) {
      config.referenceImages = options.referenceImages.map((r) => ({
        image: toImage(r),
        referenceType: 'asset',
      }));
    } else if (options.startImage) {
      params.image = toImage(options.startImage);
      if (options.endImage) config.lastFrame = toImage(options.endImage);
    }

    let operation: any = await this.ai.models.generateVideos(params);

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

    const videos = operation.response?.generatedVideos ?? [];
    if (!videos.length) {
      // Cuando RAI filtra el contenido, la operacion termina "done" sin
      // videos; la razon viene en raiMediaFilteredReasons.
      const reasons = operation.response?.raiMediaFilteredReasons;
      if (operation.response?.raiMediaFilteredCount || reasons?.length) {
        throw new Error(
          `Veo blocked the video by safety policy: ${
            reasons?.join('; ') || 'no reason provided'
          }`
        );
      }
      throw new Error(
        `Veo returned no video (response: ${JSON.stringify(
          operation.response ?? {}
        ).slice(0, 300)})`
      );
    }

    const urls: string[] = [];
    for (const v of videos) {
      const uri = v?.video?.uri;
      if (!uri) continue;
      const resp = await fetch(`${uri}&key=${this.apiKey}`);
      if (!(resp as any).ok) {
        throw new Error('Failed to download generated video');
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      urls.push(await this.upload.uploadSimple(buffer));
    }

    if (!urls.length) throw new Error('Veo returned no video URI');
    return { urls };
  }
}
