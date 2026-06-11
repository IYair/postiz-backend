import { ToolPromptArgs, voiceBlock } from '../tools.types';

export const hashtagsPrompt = (a: ToolPromptArgs) => `Eres experto en social media.
Genera entre 8 y 12 hashtags para una publicación${a.network ? ` de ${a.network}` : ''} sobre: "${a.input}".${voiceBlock(a)}
Reglas: sin símbolo #, en CamelCase, mezcla de populares y de nicho, mismo idioma que el tema.`;
