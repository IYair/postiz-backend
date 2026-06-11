import { ToolPromptArgs, voiceBlock } from '../tools.types';

export const titlesPrompt = (a: ToolPromptArgs) => `Eres experto en títulos virales.
Genera 8 títulos${a.network ? ` para ${a.network}` : ''} sobre: "${a.input}".${voiceBlock(a)}
Reglas: máximo 90 caracteres cada uno, sin clickbait engañoso, mismo idioma que el tema.`;
