import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { TextProviderType } from '../ai.types';

export function createLangChainChat(
  provider: TextProviderType,
  apiKey: string,
  model: string
): BaseChatModel {
  switch (provider) {
    case 'anthropic':
      return new ChatAnthropic({ anthropicApiKey: apiKey, model });
    case 'openai':
      return new ChatOpenAI({ openAIApiKey: apiKey, model });
    case 'gemini':
      return new ChatGoogleGenerativeAI({ apiKey, model });
    default:
      throw new Error(`Unknown text provider: ${provider}`);
  }
}
