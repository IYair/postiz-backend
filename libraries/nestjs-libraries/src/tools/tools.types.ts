export interface ToolPromptArgs {
  input: string;
  network?: string;
  brandVoice?: string;
  toneOverride?: string;
}

export const voiceBlock = (a: ToolPromptArgs): string => {
  const lines: string[] = [];
  if (a.brandVoice) lines.push(`Voz de marca: ${a.brandVoice}`);
  if (a.toneOverride)
    lines.push(`Tono requerido (tiene prioridad sobre la voz de marca): ${a.toneOverride}`);
  return lines.length ? '\n' + lines.join('\n') : '';
};
