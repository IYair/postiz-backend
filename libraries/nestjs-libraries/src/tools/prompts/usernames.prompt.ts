import { ToolPromptArgs, voiceBlock } from '../tools.registry';

export const usernamesPrompt = (a: ToolPromptArgs) => `Eres experto en naming.
Genera 8 nombres de usuario${a.network ? ` para ${a.network}` : ''} para: "${a.input}".
${voiceBlock(a)}
Reglas: sin espacios, sin caracteres especiales salvo punto o guion bajo, memorables, máximo 24 caracteres.`;
