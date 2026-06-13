import { describe, expect, it } from 'vitest';
import { getNotificationImage } from '../notification-image';

describe('getNotificationImage', () => {
  it('uses the first media thumbnail for notification previews', () => {
    expect(
      getNotificationImage(
        JSON.stringify([{ thumbnail: 'thumb.jpg', path: 'image.jpg' }])
      )
    ).toBe('thumb.jpg');
  });

  it('falls back to the first media path when no thumbnail exists', () => {
    expect(getNotificationImage(JSON.stringify([{ path: 'image.jpg' }]))).toBe(
      'image.jpg'
    );
  });

  it('ignores invalid media payloads', () => {
    expect(getNotificationImage('not-json')).toBeUndefined();
    expect(getNotificationImage(null)).toBeUndefined();
  });
});
