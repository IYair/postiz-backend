import { describe, it, expect } from 'vitest';
import { TOOLS_REGISTRY, buildToolPrompt } from '../tools.registry';

describe('tools registry', () => {
  it('contains all v1 tool keys', () => {
    expect(Object.keys(TOOLS_REGISTRY).sort()).toEqual(
      ['bios', 'captions', 'emoji-translate', 'hashtags', 'rewrite', 'titles', 'usernames'].sort()
    );
  });

  it('builds prompt with input and network', () => {
    const prompt = buildToolPrompt('hashtags', { input: 'decoración de hogar', network: 'instagram' });
    expect(prompt).toContain('decoración de hogar');
    expect(prompt).toContain('instagram');
  });

  it('injects brand voice when provided', () => {
    const prompt = buildToolPrompt('captions', { input: 'café', brandVoice: 'tono relajado, slang mexicano' });
    expect(prompt).toContain('tono relajado, slang mexicano');
  });

  it('tone override wins over brand voice tone', () => {
    const prompt = buildToolPrompt('captions', { input: 'café', brandVoice: 'formal', toneOverride: 'humorístico' });
    expect(prompt).toContain('humorístico');
  });

  it('throws on unknown toolKey', () => {
    expect(() => buildToolPrompt('nope' as any, { input: 'x' })).toThrow('Unknown tool');
  });
});
