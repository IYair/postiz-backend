import { describe, expect, it } from 'vitest';
import {
  buildTikTokVideoFileUploadSourceInfo,
  getTikTokVideoUploadChunks,
} from '../tiktok.upload';

describe('buildTikTokVideoFileUploadSourceInfo', () => {
  it('uses FILE_UPLOAD source info for videos', () => {
    expect(buildTikTokVideoFileUploadSourceInfo(1024)).toEqual({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 1024,
        chunk_size: 1024,
        total_chunk_count: 1,
      },
    });
  });

  it('splits large videos into 64MiB chunks', () => {
    const chunks = getTikTokVideoUploadChunks(70 * 1024 * 1024);

    expect(chunks).toEqual([
      { start: 0, end: 64 * 1024 * 1024 - 1 },
      { start: 64 * 1024 * 1024, end: 70 * 1024 * 1024 - 1 },
    ]);
  });
});
