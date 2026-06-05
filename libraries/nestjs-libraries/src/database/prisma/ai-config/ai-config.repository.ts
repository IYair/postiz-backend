import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AiConfigRepository {
  constructor(private _aiConfig: PrismaRepository<'userAiConfig' | 'userOrganization'>) {}

  async findByUserId(userId: string) {
    return this._aiConfig.model.userAiConfig.findUnique({
      where: { userId },
    });
  }

  async findByOrgId(orgId: string) {
    const userOrg = await this._aiConfig.model.userOrganization.findFirst({
      where: { organizationId: orgId },
      include: { user: { include: { aiConfig: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (!userOrg?.user?.aiConfig) {
      // Try any user in the org that has an AI config
      const anyUserOrg = await this._aiConfig.model.userOrganization.findFirst({
        where: {
          organizationId: orgId,
          user: { aiConfig: { isNot: null } },
        },
        include: { user: { include: { aiConfig: true } } },
      });
      return anyUserOrg?.user?.aiConfig ?? null;
    }

    return userOrg.user.aiConfig;
  }

  async upsert(
    userId: string,
    data: {
      textProvider: string;
      imageProvider?: string | null;
      textModel?: string | null;
      imageModel?: string | null;
      encryptedKeys: Record<string, string>;
    }
  ) {
    return this._aiConfig.model.userAiConfig.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async deleteByUserId(userId: string) {
    return this._aiConfig.model.userAiConfig.delete({
      where: { userId },
    });
  }
}
