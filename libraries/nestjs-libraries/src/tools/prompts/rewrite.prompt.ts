import { ToolPromptArgs, voiceBlock } from '../tools.types';

export const rewritePrompt = (a: ToolPromptArgs) => `Eres editor de contenido para redes sociales.
Reescribe el siguiente texto mejorando gancho, claridad y ritmo, conservando el mensaje y el idioma:
"""${a.input}"""${voiceBlock(a)}
Devuelve 3 versiones distintas.`;
