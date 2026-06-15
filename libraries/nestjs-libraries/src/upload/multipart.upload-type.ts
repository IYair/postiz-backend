import path from 'path';

export const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
};

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'video/mp4': '.mp4',
};

const COMPATIBLE_DETECTED_MIME_BY_EXT: Record<string, string[]> = {
  '.mp4': ['video/mp4', 'video/quicktime'],
};

export function normalizeExtension(filename: string): string | null {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXT_TO_MIME[ext] ? ext : null;
}

export function resolveMultipartUploadFileType(
  filename: string,
  contentType?: string
): { ext: string; mime: string } | null {
  const normalizedMime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (normalizedMime && ALLOWED_MIME_TO_EXT[normalizedMime]) {
    return { ext: ALLOWED_MIME_TO_EXT[normalizedMime], mime: normalizedMime };
  }

  const ext = normalizeExtension(filename);
  return ext ? { ext, mime: ALLOWED_EXT_TO_MIME[ext] } : null;
}

export function isMultipartUploadContentCompatible(
  ext: string,
  detectedMime?: string
): boolean {
  const normalizedMime = detectedMime?.split(';')[0]?.trim().toLowerCase();
  if (!normalizedMime) {
    return false;
  }

  const normalizedExt = ext.toLowerCase();
  const compatibleMimes = COMPATIBLE_DETECTED_MIME_BY_EXT[normalizedExt] || [
    ALLOWED_EXT_TO_MIME[normalizedExt],
  ];

  return compatibleMimes.includes(normalizedMime);
}
