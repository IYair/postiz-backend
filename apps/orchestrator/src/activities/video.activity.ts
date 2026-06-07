import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { VideoJobService } from '@gitroom/nestjs-libraries/database/prisma/video-jobs/video-job.service';

@Injectable()
@Activity()
export class VideoActivity {
  constructor(
    private _resolver: AiProviderResolver,
    private _mediaService: MediaService,
    private _videoJobService: VideoJobService
  ) {}

  @ActivityMethod()
  async generateVideoJob(input: { jobId: string; userId: string; orgId: string }) {
    const job = await this._videoJobService.getById(input.jobId);
    if (!job) return;
    const params: any = job.params;
    const creditIds = (job.creditIds as string[]) || [];

    try {
      const provider = await this._resolver.getVideoProvider(input.userId);
      if (!provider) {
        await this._videoJobService.fail(input.jobId, 'No video provider configured', creditIds);
        return;
      }

      const { urls } = await provider.generateVideo(params.prompt || '', {
        aspectRatio: params.aspectRatio,
        durationSeconds: params.durationSeconds,
        seed: params.seed,
        numberOfVideos: params.numberOfVideos,
        negativePrompt: params.negativePrompt,
        startImage: params.startImage,
        endImage: params.endImage,
        referenceImages: params.referenceImages,
      });

      const mediaIds: string[] = [];
      for (const url of urls) {
        const saved = await this._mediaService.saveFile(
          input.orgId,
          url.split('/').pop()!,
          url
        );
        mediaIds.push(saved.id);
      }

      await this._videoJobService.markDone(input.jobId, mediaIds);
    } catch (err: any) {
      await this._videoJobService.fail(
        input.jobId,
        err?.message || 'Video generation failed',
        creditIds
      );
    }
  }
}
