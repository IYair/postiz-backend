import { ToolPromptArgs, voiceBlock } from '../tools.registry';

export const emojiTranslatePrompt = (a: ToolPromptArgs) => `Convierte el siguiente texto en una secuencia de emojis que lo represente:
"""${a.input}"""
${voiceBlock(a)}
Devuelve 3 variantes: solo emojis, sin texto.`;
