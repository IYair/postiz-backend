import { Injectable } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { TextProvider, ImageProvider } from './ai.interfaces';
import { AiConfigService } from '@gitroom/nestjs-libraries/database/prisma/ai-config/ai-config.service';
import {
  TextProviderType,
  ImageProviderType,
  DEFAULT_TEXT_MODELS,
  DEFAULT_IMAGE_MODELS,
} from './ai.types';
import { ClaudeTextAdapter } from './adapters/text/claude-text.adapter';
import { OpenAITextAdapter } from './adapters/text/openai-text.adapter';
import { GeminiTextAdapter } from './adapters/text/gemini-text.adapter';
import { DallEImageAdapter } from './adapters/image/dalle-image.adapter';
import { GeminiImageAdapter } from './adapters/image/gemini-image.adapter';
import { createLangChainChat } from './langchain/langchain-chat.factory';
import { LangChainImageWrapper } from './langchain/langchain-image.wrapper';

const CACHE_OPTIONS = { max: 500, ttl: 5 * 60 * 1000 }; // 5 minutes

@Injectable()
export class AiProviderResolver {
  private textCache = new LRUCache<string, TextProvider>(CACHE_OPTIONS);
  private imageCache = new LRUCache<string, ImageProvider>(CACHE_OPTIONS);
  private langChainChatCache = new LRUCache<string, BaseChatModel>(
    CACHE_OPTIONS
  );
  private vercelAiCache = new LRUCache<string, any>(CACHE_OPTIONS);

  constructor(private configService: AiConfigService) {}

  async getTextProvider(userId: string): Promise<TextProvider | null> {
    const cached = this.textCache.get(userId);
    if (cached) return cached;
    const data = await this.configService.getDecryptedKeys(userId);
    if (!data) return null;
    const { config, keys } = data;
    const apiKey = keys[config.textProvider];
    if (!apiKey) return null;
    const model = config.textModel ?? DEFAULT_TEXT_MODELS[config.textProvider];
    const adapter = this.createTextAdapter(config.textProvider, apiKey, model);
    this.textCache.set(userId, adapter);
    return adapter;
  }

  async getImageProvider(userId: string): Promise<ImageProvider | null> {
    const cached = this.imageCache.get(userId);
    if (cached) return cached;
    const data = await this.configService.getDecryptedKeys(userId);
    if (!data || !data.config.imageProvider) return null;
    const { config, keys } = data;
    const apiKey = keys[config.imageProvider];
    if (!apiKey) return null;
    const model =
      config.imageModel ?? DEFAULT_IMAGE_MODELS[config.imageProvider];
    const adapter = this.createImageAdapter(
      config.imageProvider,
      apiKey,
      model
    );
    this.imageCache.set(userId, adapter);
    return adapter;
  }

  async getLangChainChat(userId: string): Promise<BaseChatModel | null> {
    const cached = this.langChainChatCache.get(userId);
    if (cached) return cached;
    const data = await this.configService.getDecryptedKeys(userId);
    if (!data) return null;
    const { config, keys } = data;
    const apiKey = keys[config.textProvider];
    if (!apiKey) return null;
    const model = config.textModel ?? DEFAULT_TEXT_MODELS[config.textProvider];
    const chatModel = createLangChainChat(config.textProvider, apiKey, model);
    this.langChainChatCache.set(userId, chatModel);
    return chatModel;
  }

  async getLangChainImage(
    userId: string
  ): Promise<LangChainImageWrapper | null> {
    const imageProvider = await this.getImageProvider(userId);
    if (!imageProvider) return null;
    return new LangChainImageWrapper(imageProvider);
  }

  async getVercelAiProvider(userId: string): Promise<any | null> {
    const cached = this.vercelAiCache.get(userId);
    if (cached) return cached;

    const data = await this.configService.getDecryptedKeys(userId);
    if (!data) return null;
    const result = this.buildVercelAiProvider(data);
    if (result) this.vercelAiCache.set(userId, result);
    return result;
  }

  private async buildVercelAiProvider(data: {
    config: { textProvider: string; textModel: string | null };
    keys: Record<string, string>;
  }): Promise<any | null> {
    const { config, keys } = data;
    const apiKey = keys[config.textProvider];
    if (!apiKey) return null;
    const model = config.textModel ?? DEFAULT_TEXT_MODELS[config.textProvider as TextProviderType];
    switch (config.textProvider) {
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        const provider = createAnthropic({ apiKey });
        return provider(model);
      }
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({ apiKey });
        return provider(model);
      }
      case 'gemini': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        const provider = createGoogleGenerativeAI({ apiKey });
        return provider(model);
      }
      default:
        throw new Error(`Unknown text provider: ${config.textProvider}`);
    }
  }

  invalidateCache(userId: string): void {
    this.textCache.delete(userId);
    this.imageCache.delete(userId);
    this.langChainChatCache.delete(userId);
    this.vercelAiCache.delete(userId);
  }

  async getTextProviderByOrgId(orgId: string): Promise<TextProvider | null> {
    const cacheKey = `org:${orgId}`;
    const cached = this.textCache.get(cacheKey);
    if (cached) return cached;
    const data = await this.configService.getDecryptedKeysByOrgId(orgId);
    if (!data) return null;
    const { config, keys } = data;
    const apiKey = keys[config.textProvider];
    if (!apiKey) return null;
    const model = config.textModel ?? DEFAULT_TEXT_MODELS[config.textProvider];
    const adapter = this.createTextAdapter(config.textProvider, apiKey, model);
    this.textCache.set(cacheKey, adapter);
    return adapter;
  }

  async getLangChainChatByOrgId(orgId: string): Promise<BaseChatModel | null> {
    const cacheKey = `org:${orgId}`;
    const cached = this.langChainChatCache.get(cacheKey);
    if (cached) return cached;
    const data = await this.configService.getDecryptedKeysByOrgId(orgId);
    if (!data) return null;
    const { config, keys } = data;
    const apiKey = keys[config.textProvider];
    if (!apiKey) return null;
    const model = config.textModel ?? DEFAULT_TEXT_MODELS[config.textProvider];
    const chatModel = createLangChainChat(config.textProvider, apiKey, model);
    this.langChainChatCache.set(cacheKey, chatModel);
    return chatModel;
  }

  async getLangChainImageByOrgId(
    orgId: string
  ): Promise<LangChainImageWrapper | null> {
    const cacheKey = `org:${orgId}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached) return new LangChainImageWrapper(cached);
    const data = await this.configService.getDecryptedKeysByOrgId(orgId);
    if (!data || !data.config.imageProvider) return null;
    const { config, keys } = data;
    const apiKey = keys[config.imageProvider];
    if (!apiKey) return null;
    const model =
      config.imageModel ?? DEFAULT_IMAGE_MODELS[config.imageProvider];
    const adapter = this.createImageAdapter(
      config.imageProvider,
      apiKey,
      model
    );
    this.imageCache.set(cacheKey, adapter);
    return new LangChainImageWrapper(adapter);
  }

  private createTextAdapter(
    provider: TextProviderType,
    apiKey: string,
    model: string
  ): TextProvider {
    switch (provider) {
      case 'anthropic':
        return new ClaudeTextAdapter(apiKey, model);
      case 'openai':
        return new OpenAITextAdapter(apiKey, model);
      case 'gemini':
        return new GeminiTextAdapter(apiKey, model);
      default:
        throw new Error(`Unknown text provider: ${provider}`);
    }
  }

  private createImageAdapter(
    provider: ImageProviderType,
    apiKey: string,
    model: string
  ): ImageProvider {
    switch (provider) {
      case 'openai':
        return new DallEImageAdapter(apiKey, model);
      case 'gemini':
        return new GeminiImageAdapter(apiKey, model);
      default:
        throw new Error(`Unknown image provider: ${provider}`);
    }
  }
}
