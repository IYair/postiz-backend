const TIKTOK_MAX_CHUNK_SIZE = 64 * 1024 * 1024;

export function getTikTokVideoChunkSize(videoSize: number) {
  return Math.min(videoSize, TIKTOK_MAX_CHUNK_SIZE);
}

export function buildTikTokVideoFileUploadSourceInfo(videoSize: number) {
  const chunkSize = getTikTokVideoChunkSize(videoSize);

  return {
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: Math.ceil(videoSize / chunkSize),
    },
  };
}

export function getTikTokVideoUploadChunks(videoSize: number) {
  const chunkSize = getTikTokVideoChunkSize(videoSize);
  const chunks: Array<{ start: number; end: number }> = [];

  for (let start = 0; start < videoSize; start += chunkSize) {
    chunks.push({ start, end: Math.min(start + chunkSize, videoSize) - 1 });
  }

  return chunks;
}
