import { describe, it, expect, vi, afterEach } from 'vitest';
import { OembedService } from '../oembed.service';

const TWEET = {
  __typename: 'Tweet',
  text: 'Hola mundo & más',
  created_at: '2025-10-05T12:00:00.000Z',
  favorite_count: 10,
  user: {
    name: 'Publer',
    screen_name: 'publer',
    verified: false,
    is_blue_verified: true,
    profile_image_url_https:
      'https://pbs.twimg.com/profile_images/1_normal.jpg',
  },
  mediaDetails: [
    { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/a.jpg' },
  ],
};

// 1x1 transparent png bytes
const PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
]);

function mockFetch() {
  return vi.spyOn(global, 'fetch' as any).mockImplementation((input: any) => {
    const u = String(input);
    if (u.includes('cdn.syndication.twimg.com')) {
      return Promise.resolve({
        ok: true,
        json: async () => JSON.parse(JSON.stringify(TWEET)),
      } as any);
    }
    // image requests
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => PNG.buffer,
    } as any);
  });
}

describe('OembedService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches a rich tweet and inlines images as data URIs', async () => {
    mockFetch();
    const service = new OembedService();
    const out = await service.getTweet('https://x.com/publer/status/1');
    expect(out.text).toBe('Hola mundo & más');
    expect(out.user.screen_name).toBe('publer');
    expect(out.user.is_blue_verified).toBe(true);
    // avatar + media converted to base64 data URIs
    expect(out.user.profile_image_url_https).toMatch(/^data:image\/png;base64,/);
    expect(out.mediaDetails[0].media_url_https).toMatch(
      /^data:image\/png;base64,/
    );
  });

  it('upgrades the avatar resolution before inlining', async () => {
    const spy = mockFetch();
    const service = new OembedService();
    await service.getTweet('https://x.com/publer/status/1');
    const fetchedAvatar = spy.mock.calls.some((c) =>
      String(c[0]).includes('_400x400')
    );
    expect(fetchedAvatar).toBe(true);
  });

  it('rejects non-twitter URLs', async () => {
    const service = new OembedService();
    await expect(service.getTweet('https://evil.com/x')).rejects.toThrow(
      'Invalid'
    );
  });

  it('rejects URLs without a tweet id', async () => {
    const service = new OembedService();
    await expect(service.getTweet('https://x.com/publer')).rejects.toThrow(
      'missing tweet id'
    );
  });

  it('throws when syndication fails', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false } as any);
    const service = new OembedService();
    await expect(service.getTweet('https://x.com/a/status/1')).rejects.toThrow(
      'not found'
    );
  });

  it('throws on tombstone (deleted/private) tweets', async () => {
    vi.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ __typename: 'TweetTombstone' }),
    } as any);
    const service = new OembedService();
    await expect(service.getTweet('https://x.com/a/status/1')).rejects.toThrow(
      'not found'
    );
  });
});
