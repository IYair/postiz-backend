import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';

const ALLOWED_REFERENCE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean,
    userId?: string,
    aspectRatio: 'square' | 'landscape' | 'portrait' | 'story' = 'square',
    referenceImages?: { mimeType: string; base64: string }[]
  ) {
    const generating = await this._subscriptionService.useCredit(
      org,
      'ai_images',
      async () => {
        // Only inject brand context when the caller expects us to expand the
        // prompt. When generatePromptFirst is false the caller already sent
        // an expanded prompt (preview-and-edit flow) that was produced via
        // /media/expand-image-prompt — which ran applyBrandContext already.
        // Re-applying here would duplicate the brand blocks in the final prompt.
        if (generatePromptFirst) {
          prompt = this.applyBrandContext(prompt, org);
        }

        // When brand kit is enabled and the caller didn't supply references,
        // auto-attach the brand logo so the generator uses it as style anchor.
        let effectiveReferences = referenceImages;
        if (
          org.brandKitEnabled &&
          org.brandLogoUrl &&
          (!effectiveReferences || effectiveReferences.length === 0)
        ) {
          const logoRef = await this.fetchAsReference(org.brandLogoUrl);
          if (logoRef) {
            effectiveReferences = [logoRef];
          }
        }

        if (generatePromptFirst) {
          prompt = await this._openAi.generatePromptForPicture(userId!, prompt);
        }
        return this._openAi.generateImage(
          userId!,
          prompt,
          !!generatePromptFirst,
          aspectRatio,
          effectiveReferences
        );
      }
    );

    return generating;
  }

  async expandImagePrompt(
    userId: string,
    prompt: string,
    org: Organization
  ) {
    const seed = this.applyBrandContext(prompt, org);
    return this._openAi.expandPictureOnly(userId, seed);
  }

  private applyBrandContext(prompt: string, org: Organization) {
    const blocks: string[] = [];

    if (org.imagePromptExtra) {
      blocks.push(
        `<!-- brand style guide -->\n${org.imagePromptExtra}\n<!-- /brand style guide -->`
      );
    }

    if (org.brandKitEnabled) {
      const kit: string[] = [];
      if (org.brandColors) kit.push(`Brand colors: ${org.brandColors}`);
      if (org.brandTypography) kit.push(`Typography: ${org.brandTypography}`);
      if (kit.length) {
        blocks.push(`<!-- brand kit -->\n${kit.join('\n')}\n<!-- /brand kit -->`);
      }
    }

    if (!blocks.length) return prompt;
    return `${prompt}\n\n${blocks.join('\n\n')}`;
  }

  private async fetchAsReference(
    url: string
  ): Promise<{ mimeType: string; base64: string } | null> {
    // The URL is organization-admin configurable, so block SSRF vectors
    // (loopback, private, link-local) via the same guard used for webhooks,
    // reject redirects so the guard can't be bypassed by a 3xx to an
    // internal address, and cap the request with a timeout + size guard.
    if (!(await isSafePublicHttpsUrl(url))) return null;

    const MAX_BYTES = 4 * 1024 * 1024;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!res.ok) return null;

      // Match the allow-list enforced by ImageReferenceDto for user-provided
      // references so the brand-kit path can't silently push types (e.g. SVG,
      // missing header) that would fail downstream in the image provider.
      const rawContentType = res.headers.get('content-type');
      if (!rawContentType) return null;
      const contentType = rawContentType.split(';')[0].trim().toLowerCase();
      if (!ALLOWED_REFERENCE_MIME_TYPES.has(contentType)) return null;

      // Enforce size upfront when Content-Length is advertised. For chunked
      // responses without a header we fall back to a streamed counter below.
      const advertised = Number(res.headers.get('content-length') ?? '');
      if (Number.isFinite(advertised) && advertised > MAX_BYTES) return null;

      if (!res.body) return null;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        if (!chunk) continue;
        received += chunk.byteLength;
        if (received > MAX_BYTES) {
          controller.abort();
          return null;
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)), received);
      return { mimeType: contentType, base64: buffer.toString('base64') };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }


  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName);
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto, userId?: string) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    console.log(body.customParams);
    await video.instance.processAndValidate(body.customParams);
    console.log('no err');

    const paramsWithUserId = { ...body.customParams, userId };

    return await this._subscriptionService.useCredit(
      org,
      'ai_videos',
      async () => {
        const loadedData = await video.instance.process(
          body.output,
          paramsWithUserId
        );

        const file = await this.storage.uploadSimple(loadedData);
        return this.saveFile(org.id, file.split('/').pop(), file);
      }
    );
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
