import { Mastra } from '@mastra/core/mastra';
import { ConsoleLogger } from '@mastra/core/logger';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { Injectable } from '@nestjs/common';
import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';

@Injectable()
export class MastraService {
  private static instances = new Map<string, Mastra>();
  constructor(private _loadToolsService: LoadToolsService) {}
  async mastra(userId?: string): Promise<Mastra> {
    const cacheKey = userId ?? '__default__';
    const existing = MastraService.instances.get(cacheKey);
    if (existing) return existing;

    const instance = new Mastra({
      storage: pStore,
      agents: {
        postiz: await this._loadToolsService.agent(userId),
      },
      logger: new ConsoleLogger({
        level: 'info',
      }),
    });

    MastraService.instances.set(cacheKey, instance);
    return instance;
  }
}
