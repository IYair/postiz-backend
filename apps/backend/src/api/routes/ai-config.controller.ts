import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { User } from '@prisma/client';
import {
  AiConfigService,
  UserAiConfigDto,
} from '@gitroom/nestjs-libraries/database/prisma/ai-config/ai-config.service';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import {
  TEXT_PROVIDERS,
  IMAGE_PROVIDERS,
  TextProviderType,
} from '@gitroom/nestjs-libraries/ai/ai.types';

// Simple in-memory rate limiter for the /test endpoint
const testRateLimit = new Map<
  string,
  { count: number; resetAt: number }
>();
const MAX_TEST_REQUESTS = 5;
const RATE_WINDOW_MS = 60 * 1000;

@Controller('/user/ai-config')
export class AiConfigController {
  constructor(
    private _aiConfigService: AiConfigService,
    private _aiProviderResolver: AiProviderResolver
  ) {}

  @Get('/')
  async getConfig(@GetUserFromRequest() user: User) {
    const config = await this._aiConfigService.getConfig(user.id);
    if (!config) {
      return null;
    }
    return config;
  }

  @Put('/')
  async saveConfig(
    @GetUserFromRequest() user: User,
    @Body() body: UserAiConfigDto
  ) {
    if (!TEXT_PROVIDERS.includes(body.textProvider as any)) {
      throw new HttpException(
        `Invalid textProvider. Must be one of: ${TEXT_PROVIDERS.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }

    if (
      body.imageProvider &&
      !IMAGE_PROVIDERS.includes(body.imageProvider as any)
    ) {
      throw new HttpException(
        `Invalid imageProvider. Must be one of: ${IMAGE_PROVIDERS.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }

    const result = await this._aiConfigService.saveConfig(user.id, body);
    this._aiProviderResolver.invalidateCache(user.id);
    return result;
  }

  @Delete('/')
  async deleteConfig(@GetUserFromRequest() user: User) {
    await this._aiConfigService.deleteConfig(user.id);
    this._aiProviderResolver.invalidateCache(user.id);
    return { success: true };
  }

  @Post('/test')
  @HttpCode(200)
  async testConnection(
    @GetUserFromRequest() user: User,
    @Body('provider') provider: TextProviderType,
    @Body('apiKey') apiKey: string
  ) {
    // Rate limiting
    const now = Date.now();
    const userLimit = testRateLimit.get(user.id);

    if (userLimit) {
      if (now > userLimit.resetAt) {
        testRateLimit.set(user.id, { count: 1, resetAt: now + RATE_WINDOW_MS });
      } else if (userLimit.count >= MAX_TEST_REQUESTS) {
        throw new HttpException(
          'Rate limit exceeded. Max 5 test requests per minute.',
          HttpStatus.TOO_MANY_REQUESTS
        );
      } else {
        userLimit.count++;
      }
    } else {
      testRateLimit.set(user.id, { count: 1, resetAt: now + RATE_WINDOW_MS });
    }

    if (!provider || !apiKey) {
      throw new HttpException(
        'provider and apiKey are required',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!TEXT_PROVIDERS.includes(provider as any)) {
      throw new HttpException(
        `Invalid provider. Must be one of: ${TEXT_PROVIDERS.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      switch (provider) {
        case 'anthropic': {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey });
          await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          });
          break;
        }
        case 'openai': {
          const OpenAI = (await import('openai')).default;
          const client = new OpenAI({ apiKey });
          await client.chat.completions.create({
            model: 'gpt-4.1',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          });
          break;
        }
        case 'gemini': {
          const { GoogleGenerativeAI } = await import(
            '@google/generative-ai'
          );
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          await model.generateContent('test');
          break;
        }
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Connection test failed',
      };
    }
  }
}
