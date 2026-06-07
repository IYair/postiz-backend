import { Injectable } from '@nestjs/common';
import { VideoJobRepository } from '@gitroom/nestjs-libraries/database/prisma/video-jobs/video-job.repository';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';

@Injectable()
export class VideoJobService {
  constructor(
    private _repo: VideoJobRepository,
    private _subscription: SubscriptionService
  ) {}

  create(orgId: string, userId: string, mode: string, params: any, creditIds: string[]) {
    return this._repo.create({ organizationId: orgId, userId, mode, params, creditIds });
  }

  getById(id: string) {
    return this._repo.findById(id);
  }

  markDone(id: string, resultMediaIds: string[]) {
    return this._repo.markDone(id, resultMediaIds);
  }

  async fail(id: string, error: string, creditIds: string[]) {
    await this._subscription.refundCredits(creditIds);
    return this._repo.markError(id, error);
  }
}
