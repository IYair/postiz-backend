import type { ToolPromptArgs } from './tools.types';
import { hashtagsPrompt } from './prompts/hashtags.prompt';
import { captionsPrompt } from './prompts/captions.prompt';
import { titlesPrompt } from './prompts/titles.prompt';
import { rewritePrompt } from './prompts/rewrite.prompt';
import { biosPrompt } from './prompts/bios.prompt';
import { usernamesPrompt } from './prompts/usernames.prompt';
import { emojiTranslatePrompt } from './prompts/emoji-translate.prompt';

export type { ToolPromptArgs } from './tools.types';
export { voiceBlock } from './tools.types';

export type ToolKey =
  | 'hashtags'
  | 'captions'
  | 'titles'
  | 'rewrite'
  | 'bios'
  | 'usernames'
  | 'emoji-translate';

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
