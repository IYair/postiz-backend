import { describe, it, expect, vi, afterEach } from 'vitest';
import { OembedService } from '../oembed.service';

const OEMBED = {
  html: '<blockquote class="twitter-tweet"><p lang="es">Hola mundo &amp; más</p>&mdash; Publer (@publer) <a href="https://twitter.com/publer/status/1">October 5, 2025</a></blockquote>',
  author_name: 'Publer',
  author_url: 'https://twitter.com/publer',
};

describe('OembedService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches and parses tweet text, author and date', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => OEMBED } as any);
    const service = new OembedService();
    const out = await service.getTweet('https://x.com/publer/status/1');
    expect(out.text).toBe('Hola mundo & más');
    expect(out.authorName).toBe('Publer');
    expect(out.username).toBe('publer');
    expect(out.date).toBe('October 5, 2025');
  });

  it('rejects non-twitter URLs', async () => {
    const service = new OembedService();
    await expect(service.getTweet('https://evil.com/x')).rejects.toThrow('Invalid');
  });

  it('throws when oEmbed fails', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false } as any);
    const service = new OembedService();
    await expect(service.getTweet('https://x.com/a/status/1')).rejects.toThrow('not found');
  });
});
