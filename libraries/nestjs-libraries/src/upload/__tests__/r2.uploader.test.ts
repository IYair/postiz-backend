import { describe, expect, it } from 'vitest';
import {
  isMultipartUploadContentCompatible,
  resolveMultipartUploadFileType,
} from '../multipart.upload-type';

describe('resolveMultipartUploadFileType', () => {
  it('prefers the uploaded MIME type over the original filename extension', () => {
    expect(
      resolveMultipartUploadFileType('original.jpg', 'image/webp')
    ).toEqual({ ext: '.webp', mime: 'image/webp' });
  });

  it('accepts QuickTime-detected video content for mp4 uploads', () => {
    expect(isMultipartUploadContentCompatible('.mp4', 'video/quicktime')).toBe(
      true
    );
  });
});
