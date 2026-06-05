import { Injectable, Logger } from '@nestjs/common';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { agentCategories } from '@gitroom/nestjs-libraries/agent/agent.categories';
import { z } from 'zod';
import { agentTopics } from '@gitroom/nestjs-libraries/agent/agent.topics';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLangChainChat } from '@gitroom/nestjs-libraries/ai/langchain/langchain-chat.factory';

interface WorkflowChannelsState {
  messages: BaseMessage[];
  topic?: string;
  category: string;
  hook?: string;
  content?: string;
}

const category = z.object({
  category: z.string().describe('The category for the post'),
});

const topic = z.object({
  topic: z.string().describe('The topic of the post'),
});

const hook = z.object({
  hook: z.string().describe('The hook of the post'),
});

@Injectable()
export class AgentGraphInsertService {
  private readonly logger = new Logger(AgentGraphInsertService.name);

  constructor(
    private _postsService: PostsService,
    private _resolver: AiProviderResolver
  ) {}
  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: () => [],
        },
        topic: null,
        category: null,
        hook: null,
        content: null,
      },
    });

  private makeFindCategory(model: BaseChatModel) {
    return async (state: WorkflowChannelsState) => {
      const { messages } = state;
      const structuredOutput = model.withStructuredOutput(category);
      return ChatPromptTemplate.fromTemplate(
        `
You are an assistant that get a social media post and categorize it into to one from the following categories:
{categories}
Here is the post:
{post}
    `
      )
        .pipe(structuredOutput)
        .invoke({
          post: messages[0].content,
          categories: agentCategories.join(', '),
        });
    };
  }

  private makeFindTopic(model: BaseChatModel) {
    return (state: WorkflowChannelsState) => {
      const { messages } = state;
      const structuredOutput = model.withStructuredOutput(topic);
      return ChatPromptTemplate.fromTemplate(
        `
You are an assistant that get a social media post and categorize it into one of the following topics:
{topics}
Here is the post:
{post}
    `
      )
        .pipe(structuredOutput)
        .invoke({
          post: messages[0].content,
          topics: agentTopics.join(', '),
        });
    };
  }

  private makeFindHook(model: BaseChatModel) {
    return (state: WorkflowChannelsState) => {
      const { messages } = state;
      const structuredOutput = model.withStructuredOutput(hook);
      return ChatPromptTemplate.fromTemplate(
        `
You are an assistant that get a social media post and extract the hook, the hook is usually the first or second of both sentence of the post, but can be in a different place, make sure you don't change the wording of the post use the exact text:
{post}
    `
      )
        .pipe(structuredOutput)
        .invoke({
          post: messages[0].content,
        });
    };
  }

  async savePost(state: WorkflowChannelsState) {
    await this._postsService.createPopularPosts({
      category: state.category,
      topic: state.topic!,
      hook: state.hook!,
      content: state.messages[0].content! as string,
    });

    return {};
  }

  /**
   * Resolve a chat model for this call.
   * When orgId is provided the user-configured provider is used.
   * Otherwise falls back to the OPENAI_API_KEY env variable with gpt-4o.
   */
  private async resolveModel(orgId?: string): Promise<BaseChatModel | null> {
    if (orgId) {
      return this._resolver.getLangChainChatByOrgId(orgId);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'No orgId provided and OPENAI_API_KEY is not set; cannot create model.'
      );
      return null;
    }

    return createLangChainChat('openai', apiKey, 'gpt-4o-2024-08-06');
  }

  async newPost(post: string, orgId?: string) {
    const model = await this.resolveModel(orgId);
    if (!model) {
      this.logger.warn('No AI model available for agent graph insert; skipping.');
      return;
    }

    const state = AgentGraphInsertService.state();
    const workflow = state
      .addNode('find-category', this.makeFindCategory(model))
      .addNode('find-topic', this.makeFindTopic(model))
      .addNode('find-hook', this.makeFindHook(model))
      .addNode('save-post', this.savePost.bind(this))
      .addEdge(START, 'find-category')
      .addEdge('find-category', 'find-topic')
      .addEdge('find-topic', 'find-hook')
      .addEdge('find-hook', 'save-post')
      .addEdge('save-post', END);

    const app = workflow.compile();
    return app.invoke({
      messages: [new HumanMessage(post)],
    });
  }
}
