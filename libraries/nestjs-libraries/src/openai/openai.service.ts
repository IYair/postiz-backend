import { HttpException, Injectable } from '@nestjs/common';
import { shuffle } from 'lodash';
import { z } from 'zod';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import {
  ChatMessage,
  ImageAspectRatio,
  ImageReference,
} from '@gitroom/nestjs-libraries/ai/ai.interfaces';

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

const SlidesSchema = z.object({
  slides: z
    .array(
      z.object({
        imagePrompt: z.string(),
        voiceText: z.string(),
      })
    )
    .describe('an array of slides'),
});

@Injectable()
export class OpenaiService {
  constructor(private resolver: AiProviderResolver) {}

  private async getTextProviderOrFail(userId: string) {
    const textProvider = await this.resolver.getTextProvider(userId);
    if (!textProvider) {
      throw new HttpException(
        'Text AI provider not configured. Go to Settings > AI Providers.',
        422
      );
    }
    return textProvider;
  }

  private async getImageProviderOrFail(userId: string) {
    const imageProvider = await this.resolver.getImageProvider(userId);
    if (!imageProvider) {
      throw new HttpException(
        'Image AI provider not configured. Go to Settings > AI Providers.',
        422
      );
    }
    return imageProvider;
  }

  async generateImage(
    userId: string,
    prompt: string,
    isUrl: boolean,
    aspectRatio: ImageAspectRatio = 'square',
    referenceImages?: ImageReference[]
  ) {
    const imageProvider = await this.getImageProviderOrFail(userId);
    const buffer = await imageProvider.generateImage(prompt, {
      aspectRatio,
      referenceImages,
    });

    if (isUrl) {
      // Return as data URL when URL is requested
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }

    return buffer.toString('base64');
  }

  async expandPictureOnly(userId: string, prompt: string) {
    // Returns the LLM-expanded prompt without invoking the image generator.
    // Used for the "preview & edit final prompt" flow (feature 2C).
    return this.generatePromptForPicture(userId, prompt);
  }

  async generatePromptForPicture(userId: string, prompt: string) {
    const textProvider = await this.getTextProviderOrFail(userId);
    const result = await textProvider.generateStructured(
      `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it's realistic describe the camera.\n\nprompt: ${prompt}`,
      PicturePrompt
    );
    return result.prompt || '';
  }

  async generateVoiceFromText(userId: string, prompt: string) {
    const textProvider = await this.getTextProviderOrFail(userId);
    const result = await textProvider.generateStructured(
      `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don't use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person.\n\nprompt: ${prompt}`,
      VoicePrompt
    );
    return result.voice || '';
  }

  async generatePosts(userId: string, content: string) {
    const textProvider = await this.getTextProviderOrFail(userId);

    const [singlePosts, threadPosts] = await Promise.all([
      Promise.all(
        Array.from({ length: 5 }, () =>
          textProvider.generateChat(
            [
              {
                role: 'assistant',
                content:
                  'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
              },
              {
                role: 'user',
                content: content!,
              },
            ],
            { temperature: 1 }
          )
        )
      ),
      Promise.all(
        Array.from({ length: 5 }, () =>
          textProvider.generateChat(
            [
              {
                role: 'assistant',
                content:
                  'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
              },
              {
                role: 'user',
                content: content!,
              },
            ],
            { temperature: 1 }
          )
        )
      ),
    ]);

    const allResults = [...singlePosts, ...threadPosts];

    return shuffle(
      allResults.map((responseContent) => {
        const start = responseContent?.indexOf('[')!;
        const end = responseContent?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              responseContent
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }

  async extractWebsiteText(userId: string, content: string) {
    const textProvider = await this.getTextProviderOrFail(userId);
    const articleContent = await textProvider.generateChat([
      {
        role: 'assistant',
        content:
          'You take a full website text, and extract only the article content',
      },
      {
        role: 'user',
        content,
      },
    ]);

    return this.generatePosts(userId, articleContent!);
  }

  async separatePosts(userId: string, content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const textProvider = await this.getTextProviderOrFail(userId);

    const result = await textProvider.generateStructured(
      `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
        len - 10
      } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context.\n\n${content}`,
      SeparatePostsPrompt
    );

    const posts = result.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              const shrunk = await textProvider.generateStructured(
                `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines.\n\n${post}`,
                SeparatePostPrompt
              );
              return shrunk.post || '';
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(userId: string, text: string) {
    const textProvider = await this.getTextProviderOrFail(userId);

    for (let i = 0; i < 3; i++) {
      try {
        const result = await textProvider.generateStructured(
          `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum.\n\n${text}`,
          SlidesSchema
        );
        return result.slides || [];
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }
}
