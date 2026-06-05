import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
  HttpException,
} from '@nestjs/common';
import {
  CopilotRuntime,
  LangChainAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, User } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
  userId: string;
};

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService,
    private _aiProviderResolver: AiProviderResolver
  ) {}
  @Post('/chat')
  async chatAgent(
    @Req() req: Request,
    @Res() res: Response,
    @GetUserFromRequest() user: User
  ) {
    const chatModel = await this._aiProviderResolver.getLangChainChat(user.id);
    if (!chatModel) {
      throw new HttpException('Text AI provider not configured.', 422);
    }

    const adapter = new LangChainAdapter({
      chainFn: async ({ messages }) => {
        return chatModel.stream(messages as any) as any;
      },
    });

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      runtime: new CopilotRuntime(),
      serviceAdapter: adapter,
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User
  ) {
    const chatModel = await this._aiProviderResolver.getLangChainChat(user.id);
    if (!chatModel) {
      throw new HttpException('Text AI provider not configured.', 422);
    }

    const adapter = new LangChainAdapter({
      chainFn: async ({ messages }) => {
        return chatModel.stream(messages as any) as any;
      },
    });

    const mastra = await this._mastraService.mastra(user.id);
    const requestContext = new RequestContext<ChannelsContext>();
    requestContext.set(
      'integrations',
      req?.body?.variables?.properties?.integrations || []
    );

    requestContext.set('organization', JSON.stringify(organization));
    requestContext.set('ui', 'true');
    requestContext.set('userId', user.id);

    const agents = MastraAgent.getLocalAgents({
      resourceId: organization.id,
      mastra,
      requestContext: requestContext as any,
    });

    const runtime = new CopilotRuntime({
      agents,
    });

    const copilotRuntimeHandler = copilotRuntimeNextJSAppRouterEndpoint({
      endpoint: '/copilot/agent',
      runtime,
      serviceAdapter: adapter,
    });

    return copilotRuntimeHandler.handleRequest(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra(user.id);
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      Logger.error(
        `memory.recall failed for thread=${threadId} resource=${organization.id}: ${
          (err as Error)?.message
        }`,
        (err as Error)?.stack
      );
      return { messages: [], uiMessages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User
  ) {
    const mastra = await this._mastraService.mastra(user.id);
    const memory = await mastra.getAgent('postiz').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }
}
