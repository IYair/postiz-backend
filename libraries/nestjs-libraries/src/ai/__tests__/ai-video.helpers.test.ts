import { describe, it, expect } from 'vitest';
import { validateVideoModeParams } from '../video/ai-video.helpers';

const img = { mimeType: 'image/png', base64: 'AAA' };

describe('validateVideoModeParams', () => {
  it('text: requiere prompt', () => {
    expect(validateVideoModeParams({ mode: 'text', prompt: '' } as any)).toBe('prompt is required');
    expect(validateVideoModeParams({ mode: 'text', prompt: 'hi' } as any)).toBeNull();
  });

  it('frames: requiere startImage', () => {
    expect(validateVideoModeParams({ mode: 'frames' } as any)).toBe('startImage is required for frames mode');
    expect(validateVideoModeParams({ mode: 'frames', startImage: img } as any)).toBeNull();
  });

  it('ingredients: requiere prompt y al menos una referencia, max 3', () => {
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: 'x' } as any)).toBe('at least one reference image is required');
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: '', referenceImages: [img] } as any)).toBe('prompt is required');
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: 'x', referenceImages: [img, img, img, img] } as any)).toBe('max 3 reference images');
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: 'x', referenceImages: [img] } as any)).toBeNull();
  });
});
