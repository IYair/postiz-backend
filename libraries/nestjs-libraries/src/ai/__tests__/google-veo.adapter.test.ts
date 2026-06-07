import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  uploadSimple: vi.fn(async (b: any) => 'https://cdn.example.com/v.mp4'),
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
  it('texto: mapea config y devuelve urls', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }],
    }});
    const adapter = new GoogleVeoAdapter('key-123', 'veo-3.0-fast-generate-001', fakeUpload as any, 0);

    const result = await adapter.generateVideo('a cat', {
      aspectRatio: '16:9', durationSeconds: 8, seed: 42, numberOfVideos: 1, negativePrompt: 'blurry',
    });

    expect(generateVideos).toHaveBeenCalledWith(expect.objectContaining({
      model: 'veo-3.0-fast-generate-001',
      prompt: 'a cat',
      config: expect.objectContaining({
        aspectRatio: '16:9', durationSeconds: 8, seed: 42, numberOfVideos: 1, negativePrompt: 'blurry',
      }),
    }));
    expect(result).toEqual({ urls: ['https://cdn.example.com/v.mp4'] });
  });

  it('fotogramas: envia image y lastFrame, no referenceImages', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }],
    }});
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    await adapter.generateVideo('x', {
      aspectRatio: 'auto',
      startImage: { mimeType: 'image/png', base64: 'AAA' },
      endImage: { mimeType: 'image/png', base64: 'BBB' },
    });
    const call = generateVideos.mock.calls[0][0];
    expect(call.image).toEqual({ imageBytes: 'AAA', mimeType: 'image/png' });
    expect(call.config.lastFrame).toEqual({ imageBytes: 'BBB', mimeType: 'image/png' });
    expect(call.config.referenceImages).toBeUndefined();
  });

  it('ingredientes: envia referenceImages, no image/lastFrame', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }],
    }});
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    await adapter.generateVideo('x', {
      aspectRatio: '9:16',
      referenceImages: [{ mimeType: 'image/jpeg', base64: 'R1' }, { mimeType: 'image/jpeg', base64: 'R2' }],
    });
    const call = generateVideos.mock.calls[0][0];
    expect(call.image).toBeUndefined();
    expect(call.config.lastFrame).toBeUndefined();
    expect(call.config.referenceImages).toEqual([
      { image: { imageBytes: 'R1', mimeType: 'image/jpeg' }, referenceType: 'asset' },
      { image: { imageBytes: 'R2', mimeType: 'image/jpeg' }, referenceType: 'asset' },
    ]);
  });

  it('numberOfVideos>1: descarga y sube cada uno', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }, { video: { uri: 'https://g/b.mp4' } }],
    }});
    fakeUpload.uploadSimple
      .mockResolvedValueOnce('https://cdn/1.mp4')
      .mockResolvedValueOnce('https://cdn/2.mp4');
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    const result = await adapter.generateVideo('x', { aspectRatio: '16:9', numberOfVideos: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ urls: ['https://cdn/1.mp4', 'https://cdn/2.mp4'] });
  });

  it('lanza si la operacion devuelve error', async () => {
    generateVideos.mockResolvedValue({ done: true, error: { message: 'quota exceeded' } });
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    await expect(adapter.generateVideo('x', { aspectRatio: 'auto' })).rejects.toThrow('quota exceeded');
  });
});
