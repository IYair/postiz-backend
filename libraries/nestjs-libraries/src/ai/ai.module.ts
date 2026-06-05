import { Module } from '@nestjs/common';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import { AiConfigService } from '@gitroom/nestjs-libraries/database/prisma/ai-config/ai-config.service';
import { AiConfigRepository } from '@gitroom/nestjs-libraries/database/prisma/ai-config/ai-config.repository';

@Module({
  providers: [AiProviderResolver, AiConfigService, AiConfigRepository],
  exports: [AiProviderResolver, AiConfigService],
})
export class AiModule {}
