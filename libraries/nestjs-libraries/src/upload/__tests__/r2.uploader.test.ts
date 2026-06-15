import { describe, expect, it } from 'vitest';
import { resolveMultipartUploadFileType } from '../multipart.upload-type';

describe('resolveMultipartUploadFileType', () => {
  it('prefers the uploaded MIME type over the original filename extension', () => {
    expect(
      resolveMultipartUploadFileType('original.jpg', 'image/webp')
    ).toEqual({ ext: '.webp', mime: 'image/webp' });
  });
});
