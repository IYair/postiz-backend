import { ImageReference } from '../ai.interfaces';

export type VideoMode = 'text' | 'frames' | 'ingredients';

export interface AiVideoParams {
  mode: VideoMode;
  prompt?: string;
  startImage?: ImageReference;
  endImage?: ImageReference;
  referenceImages?: ImageReference[];
}

// Devuelve un mensaje de error si los params no son válidos para el modo, o null si OK.
export function validateVideoModeParams(p: AiVideoParams): string | null {
  if (p.mode === 'text') {
    if (!p.prompt) return 'prompt is required';
    return null;
  }
  if (p.mode === 'frames') {
    if (!p.startImage) return 'startImage is required for frames mode';
    return null;
  }
  if (p.mode === 'ingredients') {
    if (!p.prompt) return 'prompt is required';
    if (!p.referenceImages?.length) return 'at least one reference image is required';
    if (p.referenceImages.length > 3) return 'max 3 reference images';
    return null;
  }
  return 'unknown mode';
}
