import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

const TWITTER_HOSTS = [
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'mobile.twitter.com',
];

// Mirrors react-tweet: a deterministic token derived from the tweet id.
function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '');
}

function extractId(pathname: string): string | null {
  const match = pathname.match(/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

const SYNDICATION_FEATURES = [
  'tfw_timeline_list:',
  'tfw_follower_count_sunset:true',
  'tfw_tweet_edit_backend:on',
  'tfw_refsrc_session:on',
  'tfw_fosnr_soft_interventions_enabled:on',
  'tfw_show_business_verified_badge:on',
  'tfw_duplicate_scribes_to_settings:on',
  'tfw_use_profile_image_shape_enabled:on',
  'tfw_show_blue_verified_badge:on',
  'tfw_legacy_timeline_sunset:true',
  'tfw_show_gov_verified_badge:on',
  'tfw_show_business_affiliate_badge:on',
  'tfw_tweet_edit_frontend:on',
].join(';');

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB per image safety cap

@Injectable()
export class OembedService {
  /**
   * Fetches a full tweet payload from Twitter's syndication API (the same
   * source react-tweet uses). Returns the raw Tweet object so the frontend can
   * render it with react-tweet's <EmbeddedTweet />. All remote images
   * (avatars, media, quoted-tweet media) are inlined as base64 data URIs so the
   * client can screenshot the card without running into CORS restrictions.
   */
  async getTweet(url: string): Promise<any> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (!TWITTER_HOSTS.includes(parsed.hostname)) {
      throw new BadRequestException(
        'Invalid URL: only twitter.com / x.com posts'
      );
    }

    const id = extractId(parsed.pathname);
    if (!id) {
      throw new BadRequestException('Invalid URL: missing tweet id');
    }

    const token = getToken(id);
    const api = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en&features=${encodeURIComponent(
      SYNDICATION_FEATURES
    )}`;

    const res = await fetch(api, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
      },
    }).catch(() => null);

    if (!res || !res.ok) {
      throw new NotFoundException('Tweet not found or private');
    }

    const data = await res.json().catch(() => null);
    if (
      !data ||
      data.__typename === 'TweetTombstone' ||
      (!data.text && !data.full_text)
    ) {
      throw new NotFoundException('Tweet not found or private');
    }

    await this.inlineImages(data);
    return data;
  }

  private async inlineImages(tweet: any): Promise<void> {
    const tasks: Promise<void>[] = [];

    const queue = (
      holder: any,
      key: string,
      transform?: (u: string) => string
    ) => {
      const original = holder?.[key];
      if (typeof original !== 'string' || !/^https?:\/\//.test(original)) {
        return;
      }
      const target = transform ? transform(original) : original;
      tasks.push(
        this.toDataUri(target).then((dataUri) => {
          if (dataUri) holder[key] = dataUri;
        })
      );
    };

    const upgradeAvatar = (u: string) => u.replace('_normal', '_400x400');

    const walk = (node: any) => {
      if (!node) return;
      if (node.user) queue(node.user, 'profile_image_url_https', upgradeAvatar);
      for (const media of node.mediaDetails || []) {
        queue(media, 'media_url_https');
      }
      for (const photo of node.photos || []) {
        queue(photo, 'url');
      }
      if (node.video) queue(node.video, 'poster');
    };

    walk(tweet);
    walk(tweet.quoted_tweet);

    await Promise.all(tasks);
  }

  private async toDataUri(url: string): Promise<string | null> {
    try {
      const res = await fetch(url).catch(() => null);
      if (!res || !res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_IMAGE_BYTES) return null;
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }
}
