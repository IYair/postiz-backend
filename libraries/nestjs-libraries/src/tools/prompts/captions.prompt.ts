import { ToolPromptArgs, voiceBlock } from '../tools.types';

export const captionsPrompt = (a: ToolPromptArgs) => `Eres copywriter de redes sociales.
Genera 5 captions cortos (1-2 frases) para una publicación${a.network ? ` de ${a.network}` : ''} sobre: "${a.input}".${voiceBlock(a)}
Reglas: gancho fuerte, sin hashtags, mismo idioma que el tema, variedad de ángulos.`;
