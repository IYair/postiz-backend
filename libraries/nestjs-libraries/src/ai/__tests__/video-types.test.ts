import { describe, it, expect } from 'vitest';
import {
  VIDEO_PROVIDERS,
  DEFAULT_VIDEO_MODELS,
  VEO_ASPECT_MAP,
} from '../ai.types';

describe('video types', () => {
  it('lists google as a video provider', () => {
    expect(VIDEO_PROVIDERS).toContain('google');
  });

  it('has a default model for google', () => {
    expect(DEFAULT_VIDEO_MODELS.google).toBe('veo-3.0-fast-generate-001');
  });

  it('maps aspect ratios to Veo-supported values', () => {
    expect(VEO_ASPECT_MAP['16:9']).toBe('16:9');
    expect(VEO_ASPECT_MAP['9:16']).toBe('9:16');
    expect(VEO_ASPECT_MAP['auto']).toBe('16:9');
  });
});
