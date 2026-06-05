import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class ImagePresetRepository {
  constructor(
    private readonly _imagePreset: PrismaRepository<'imagePreset'>
  ) {}

  list(orgId: string) {
    return this._imagePreset.model.imagePreset.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(
    orgId: string,
    data: {
      name: string;
      stylePrompt: string;
      aspectRatio?: string | null;
    }
  ) {
    return this._imagePreset.model.imagePreset.create({
      data: {
        orgId,
        name: data.name,
        stylePrompt: data.stylePrompt,
        aspectRatio: data.aspectRatio ?? null,
      },
    });
  }

  update(
    orgId: string,
    id: string,
    data: {
      name: string;
      stylePrompt: string;
      aspectRatio?: string | null;
    }
  ) {
    return this._imagePreset.model.imagePreset.updateMany({
      where: { id, orgId },
      data: {
        name: data.name,
        stylePrompt: data.stylePrompt,
        aspectRatio: data.aspectRatio ?? null,
      },
    });
  }

  delete(orgId: string, id: string) {
    return this._imagePreset.model.imagePreset.deleteMany({
      where: { id, orgId },
    });
  }
}
