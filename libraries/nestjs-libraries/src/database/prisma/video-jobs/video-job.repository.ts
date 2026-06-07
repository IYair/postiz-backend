import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoJobRepository {
  constructor(private _job: PrismaRepository<'videoGenerationJob'>) {}

  create(data: {
    organizationId: string;
    userId: string;
    mode: string;
    params: any;
    creditIds: string[];
  }) {
    return this._job.model.videoGenerationJob.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        mode: data.mode,
        params: data.params,
        creditIds: data.creditIds,
      },
    });
  }

  findById(id: string) {
    return this._job.model.videoGenerationJob.findUnique({ where: { id } });
  }

  markDone(id: string, resultMediaIds: string[]) {
    return this._job.model.videoGenerationJob.update({
      where: { id },
      data: { status: 'done', resultMediaIds },
    });
  }

  markError(id: string, error: string) {
    return this._job.model.videoGenerationJob.update({
      where: { id },
      data: { status: 'error', error },
    });
  }
}
