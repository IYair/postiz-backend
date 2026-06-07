// libraries/nestjs-libraries/src/ai/ai.interfaces.ts

export interface TextOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export type ImageAspectRatio = 'square' | 'landscape' | 'portrait' | 'story';

export interface ImageReference {
  mimeType: string;
  base64: string;
}

export interface ImageOptions {
  aspectRatio: ImageAspectRatio;
  referenceImages?: ImageReference[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TextProvider {
  generateText(prompt: string, options?: TextOptions): Promise<string>;
  generateStructured<T>(prompt: string, schema: import('zod').ZodSchema<T>): Promise<T>;
  generateChat(messages: ChatMessage[], options?: TextOptions): Promise<string>;
}

export interface ImageProvider {
  generateImage(prompt: string, options?: ImageOptions): Promise<Buffer>;
}

export type VideoAspectRatio = '16:9' | '9:16' | 'auto';

export interface VideoOptions {
  aspectRatio: VideoAspectRatio;
  // Las opciones de abajo las consumen las Fases B/C; el adapter de Fase A
  // implementa solo prompt + aspectRatio. Se declaran aquí para fijar el contrato.
  durationSeconds?: number;
  seed?: number;
  numberOfVideos?: number;
  startImage?: ImageReference;
  endImage?: ImageReference;
  referenceImages?: ImageReference[];
  negativePrompt?: string;
}

export interface VideoGenerationResult {
  urls: string[];
}

export interface VideoProvider {
  generateVideo(
    prompt: string,
    options: VideoOptions
  ): Promise<VideoGenerationResult>;
}
