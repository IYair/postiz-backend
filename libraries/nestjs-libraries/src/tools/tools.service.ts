import { Injectable, PreconditionFailedException } from '@nestjs/common';
import { z } from 'zod';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { buildToolPrompt, ToolKey } from './tools.registry';

const resultsSchema = z.object({ results: z.array(z.string()).min(1) });

export interface GenerateArgs {
  input: string;
  network?: string;
  toneOverride?: string;
}

@Injectable()
export class ToolsService {
  constructor(
    private _aiProviderResolver: AiProviderResolver,
    private _organizationService: OrganizationService
  ) {}

  async generate(orgId: string, toolKey: ToolKey, args: GenerateArgs) {
    const brandKit = await this._organizationService.getBrandKit(orgId);
    const brandVoice =
      brandKit?.brandKitEnabled && (brandKit as any)?.brandVoice
        ? ((brandKit as any).brandVoice as string)
        : undefined;

    const prompt = buildToolPrompt(toolKey, { ...args, brandVoice });

    const provider = await this._aiProviderResolver.getTextProviderByOrgId(orgId);
    if (!provider) {
      throw new PreconditionFailedException(
        'No AI provider configured. Add one in Settings → AI Configuration.'
      );
    }

    const out = await provider.generateStructured(prompt, resultsSchema);
    return { results: out.results };
  }
}
