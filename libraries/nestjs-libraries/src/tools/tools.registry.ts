import { hashtagsPrompt } from './prompts/hashtags.prompt';
import { captionsPrompt } from './prompts/captions.prompt';
import { titlesPrompt } from './prompts/titles.prompt';
import { rewritePrompt } from './prompts/rewrite.prompt';
import { biosPrompt } from './prompts/bios.prompt';
import { usernamesPrompt } from './prompts/usernames.prompt';
import { emojiTranslatePrompt } from './prompts/emoji-translate.prompt';

export interface ToolPromptArgs {
  input: string;
  network?: string;
  brandVoice?: string;
  toneOverride?: string;
}

export type ToolKey =
  | 'hashtags'
  | 'captions'
  | 'titles'
  | 'rewrite'
  | 'bios'
  | 'usernames'
  | 'emoji-translate';

export const voiceBlock = (a: ToolPromptArgs): string => {
  const lines: string[] = [];
  if (a.brandVoice) lines.push(`Voz de marca: ${a.brandVoice}`);
  if (a.toneOverride)
    lines.push(`Tono requerido (tiene prioridad sobre la voz de marca): ${a.toneOverride}`);
  return lines.join('\n');
};

export const TOOLS_REGISTRY: Record<ToolKey, (a: ToolPromptArgs) => string> = {
  hashtags: hashtagsPrompt,
  captions: captionsPrompt,
  titles: titlesPrompt,
  rewrite: rewritePrompt,
  bios: biosPrompt,
  usernames: usernamesPrompt,
  'emoji-translate': emojiTranslatePrompt,
};

export const buildToolPrompt = (key: ToolKey, args: ToolPromptArgs): string => {
  const builder = TOOLS_REGISTRY[key];
  if (!builder) throw new Error(`Unknown tool: ${key}`);
  return builder(args);
};
