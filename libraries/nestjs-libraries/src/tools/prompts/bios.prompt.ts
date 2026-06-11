import { ToolPromptArgs, voiceBlock } from '../tools.registry';

export const biosPrompt = (a: ToolPromptArgs) => `Eres experto en branding personal.
Genera 6 bios${a.network ? ` para ${a.network}` : ''} para: "${a.input}".
${voiceBlock(a)}
Reglas: máximo 150 caracteres cada una, con emoji moderado, mismo idioma que la descripción.`;
