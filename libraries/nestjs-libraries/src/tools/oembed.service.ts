import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

export interface TweetData {
  text: string;
  authorName: string;
  username: string;
  date: string;
}

@Injectable()
export class OembedService {
  async getTweet(url: string): Promise<TweetData> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (!['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'].includes(parsed.hostname)) {
      throw new BadRequestException('Invalid URL: only twitter.com / x.com posts');
    }

    const res = await fetch(
      `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`
    ).catch(() => null);
    if (!res || !res.ok) throw new NotFoundException('Tweet not found or private');

    const data: { html: string; author_name: string; author_url: string } = await res.json();

    const textMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const dateMatch = data.html.match(/<a[^>]*>([^<]+)<\/a>\s*<\/blockquote>/);
    const username = data.author_url.split('/').filter(Boolean).pop() || '';

    const decode = (s: string) =>
      s
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&mdash;/g, '—');

    return {
      text: decode(textMatch?.[1] ?? ''),
      authorName: data.author_name,
      username,
      date: dateMatch?.[1] ?? '',
    };
  }
}
