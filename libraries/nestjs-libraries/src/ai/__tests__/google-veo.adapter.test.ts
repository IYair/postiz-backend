import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del SDK de Google antes de importar el adapter.
const generateVideos = vi.fn();
const getVideosOperation = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateVideos },
    operations: { getVideosOperation },
  })),
}));

import { GoogleVeoAdapter } from '../adapters/video/google-veo.adapter';

const fakeUpload = {
  uploadSimple: vi.fn(async () => 'https://cdn.example.com/video.mp4'),
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })) as any;
});

describe('GoogleVeoAdapter', () => {
  it('genera, hace polling y devuelve la URL subida', async () => {
    generateVideos.mockResolvedValue({ done: false, name: 'op/1' });
    getVideosOperation.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [{ video: { uri: 'https://g/v.mp4' } }],
      },
    });

    const adapter = new GoogleVeoAdapter(
      'key-123',
      'veo-3.0-fast-generate-001',
      fakeUpload as any,
      0
    );

    const result = await adapter.generateVideo('a cat', {
      aspectRatio: '16:9',
    });

    expect(generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'veo-3.0-fast-generate-001',
        prompt: 'a cat',
        config: expect.objectContaining({ aspectRatio: '16:9', numberOfVideos: 1 }),
      })
    );
    expect(global.fetch).toHaveBeenCalledWith('https://g/v.mp4&key=key-123');
    expect(fakeUpload.uploadSimple).toHaveBeenCalled();
    expect(result).toEqual({ url: 'https://cdn.example.com/video.mp4' });
  });

  it('lanza si la operación devuelve error', async () => {
    generateVideos.mockResolvedValue({
      done: true,
      error: { message: 'quota exceeded' },
    });

    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);

    await expect(
      adapter.generateVideo('x', { aspectRatio: 'auto' })
    ).rejects.toThrow('quota exceeded');
  });
});
