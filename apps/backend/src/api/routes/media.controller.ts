import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ApiTags } from '@nestjs/swagger';
import handleR2Upload from '@gitroom/nestjs-libraries/upload/r2.uploader';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  ExpandImagePromptDto,
  GenerateImageDto,
} from '@gitroom/nestjs-libraries/dtos/media/generate-image.dto';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { AiVideoDto } from '@gitroom/nestjs-libraries/dtos/videos/ai-video.dto';
import { VideoJobService } from '@gitroom/nestjs-libraries/database/prisma/video-jobs/video-job.service';
import { TemporalService } from 'nestjs-temporal-core';
import { validateVideoModeParams } from '@gitroom/nestjs-libraries/ai/video/ai-video.helpers';

@ApiTags('Media')
@Controller('/media')
export class MediaController {
  private storage = UploadFactory.createStorage();
  constructor(
    private _mediaService: MediaService,
    private _subscriptionService: SubscriptionService,
    private _videoJobService: VideoJobService,
    private _temporalService: TemporalService
  ) {}

  @Delete('/:id')
  deleteMedia(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._mediaService.deleteMedia(org.id, id);
  }

  @Post('/expand-image-prompt')
  async expandImagePrompt(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: ExpandImagePromptDto
  ) {
    // Returns the LLM-expanded prompt so the user can review/edit before
    // spending a credit on image generation (feature 2C).
    const expanded = await this._mediaService.expandImagePrompt(
      user.id,
      body.prompt,
      org
    );
    return { prompt: expanded };
  }

  @Post('/generate-video')
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: VideoDto
  ) {
    console.log('hello');
    return this._mediaService.generateVideo(org, body, user.id);
  }

  @Post('/generate-image')
  async generateImage(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: GenerateImageDto
  ) {
    const total = await this._subscriptionService.checkCredits(org);
    if (process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0) {
      return false;
    }

    const result = await this._mediaService.generateImage(
      body.prompt,
      org,
      false,
      user.id,
      body.aspectRatio ?? 'square',
      body.referenceImages
    );
    const base64 = Buffer.isBuffer(result)
      ? result.toString('base64')
      : result;

    return {
      output: 'data:image/png;base64,' + base64,
    };
  }

  @Post('/generate-image-with-prompt')
  async generateImageFromText(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: GenerateImageDto
  ) {
    const total = await this._subscriptionService.checkCredits(org);
    if (process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0) {
      return false;
    }

    // When skipExpansion is true, the caller passed an already-expanded prompt
    // (feature 2C: "preview & edit final prompt"), so we bypass LLM expansion.
    // Default aspectRatio matches /generate-image for consistency; the frontend
    // always sends an explicit value resolved from the platform selection.
    const result = await this._mediaService.generateImage(
      body.prompt,
      org,
      !body.skipExpansion,
      user.id,
      body.aspectRatio ?? 'square',
      body.referenceImages
    );
    if (!result) {
      return false;
    }

    // Convert result to Buffer for direct upload
    const imageData = Buffer.isBuffer(result)
      ? result
      : Buffer.from(
          String(result).replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
    const file = await this.storage.uploadSimple(imageData);

    return this._mediaService.saveFile(org.id, file.split('/').pop()!, file);
  }

  @Post('/upload-server')
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new CustomFileValidationPipe())
  async uploadServer(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile() file: Express.Multer.File
  ) {
    const originalName = file?.originalname || '';
    const uploadedFile = await this.storage.uploadFile(file);
    return this._mediaService.saveFile(
      org.id,
      uploadedFile.originalname,
      uploadedFile.path,
      originalName
    );
  }

  @Post('/save-media')
  async saveMedia(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Body('name') name: string,
    @Body('originalName') originalName: string
  ) {
    if (!name) {
      return false;
    }
    return this._mediaService.saveFile(
      org.id,
      name,
      process.env.CLOUDFLARE_BUCKET_URL + '/' + name,
      originalName || undefined
    );
  }

  @Post('/information')
  saveMediaInformation(
    @GetOrgFromRequest() org: Organization,
    @Body() body: SaveMediaInformationDto
  ) {
    return this._mediaService.saveMediaInformation(org.id, body);
  }

  @Post('/upload-simple')
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File,
    @Body('preventSave') preventSave: string = 'false'
  ) {
    const originalName = file.originalname;
    const getFile = await this.storage.uploadFile(file);

    if (preventSave === 'true') {
      const { path } = getFile;
      return { path };
    }

    return this._mediaService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path,
      originalName
    );
  }

  @Post('/:endpoint')
  async uploadFile(
    @GetOrgFromRequest() org: Organization,
    @Req() req: Request,
    @Res() res: Response,
    @Param('endpoint') endpoint: string
  ) {
    const upload = await handleR2Upload(endpoint, req, res);
    if (endpoint !== 'complete-multipart-upload') {
      return upload;
    }

    // @ts-ignore
    const name = upload.Location.split('/').pop();
    const originalName = req.body?.file?.name;

    const saveFile = await this._mediaService.saveFile(
      org.id,
      name,
      // @ts-ignore
      upload.Location,
      originalName || undefined
    );

    res.status(200).json({ ...upload, saved: saveFile });
  }

  @Get('/')
  getMedia(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page: number,
    @Query('search') search?: string
  ) {
    return this._mediaService.getMedia(org.id, page, search);
  }

  @Get('/video-options')
  getVideos() {
    return this._mediaService.getVideoOptions();
  }

  @Post('/video/function')
  videoFunction(
    @Body() body: VideoFunctionDto
  ) {
    return this._mediaService.videoFunction(body.identifier, body.functionName, body.params);
  }

  @Get('/generate-video/:type/allowed')
  generateVideoAllowed(
    @GetOrgFromRequest() org: Organization,
    @Param('type') type: string
  ) {
    return this._mediaService.generateVideoAllowed(org, type);
  }

  @Post('/ai-video')
  async aiVideo(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: AiVideoDto
  ) {
    const validationError = validateVideoModeParams(body as any);
    if (validationError) {
      throw new HttpException(validationError, HttpStatus.BAD_REQUEST);
    }

    const ALLOWED = new Set([
      'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    ]);
    const allImages = [
      body.startImage, body.endImage, ...(body.referenceImages || []),
    ].filter(Boolean) as { mimeType: string }[];
    if (allImages.some((img) => !ALLOWED.has(img.mimeType))) {
      throw new HttpException(
        'Unsupported image type. Allowed: png, jpeg, webp, gif, heic, heif',
        HttpStatus.BAD_REQUEST
      );
    }

    const credits = await this._subscriptionService.checkCredits(org, 'ai_videos');
    if (process.env.STRIPE_PUBLISHABLE_KEY && credits.credits < body.numberOfVideos) {
      throw new HttpException('Not enough video credits', HttpStatus.PAYMENT_REQUIRED);
    }

    const creditIds = await this._subscriptionService.createCredits(
      org.id, 'ai_videos', body.numberOfVideos
    );

    const job = await this._videoJobService.create(org.id, user.id, body.mode, body, creditIds);

    const temporalClient = this._temporalService.client.getRawClient();
    if (!temporalClient) {
      await this._videoJobService.fail(job.id, 'Video generation service unavailable', creditIds);
      throw new HttpException('Failed to start generation', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    try {
      await temporalClient.workflow.start('videoGenerationWorkflow', {
        workflowId: `video_${job.id}`,
        taskQueue: 'main',
        args: [{ jobId: job.id, userId: user.id, orgId: org.id }],
      });
    } catch (err: any) {
      await this._videoJobService.fail(job.id, 'Failed to start generation', creditIds);
      throw new HttpException('Failed to start generation', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { jobId: job.id };
  }

  @Get('/ai-video/:jobId')
  async aiVideoStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('jobId') jobId: string
  ) {
    const job = await this._videoJobService.getById(jobId);
    if (!job || job.organizationId !== org.id) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    const ids = (job.resultMediaIds as string[]) || [];
    const media = await Promise.all(ids.map((id) => this._mediaService.getMediaById(id)));
    return {
      status: job.status,
      error: job.error,
      media: media.filter(Boolean).map((m: any) => ({ id: m.id, path: m.path })),
    };
  }
}
