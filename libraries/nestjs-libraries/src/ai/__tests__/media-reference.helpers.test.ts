import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMock }));

import {
  isVideoPath,
  extractLastFrame,
} from '../video/media-reference.helpers';

function fakeProcess() {
  const proc: any = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

describe('isVideoPath', () => {
  it('detecta extensiones de video, ignorando query/fragment y case', () => {
    expect(isVideoPath('https://cdn.x.com/a/b/clip.mp4')).toBe(true);
    expect(isVideoPath('https://cdn.x.com/clip.MP4?x=1')).toBe(true);
    expect(isVideoPath('https://cdn.x.com/clip.webm#t=2')).toBe(true);
    expect(isVideoPath('https://cdn.x.com/img.png')).toBe(false);
    expect(isVideoPath('https://cdn.x.com/noext')).toBe(false);
  });
});

describe('extractLastFrame', () => {
  beforeEach(() => spawnMock.mockReset());

  it('devuelve jpeg base64 cuando ffmpeg sale con 0', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc);
    const promise = extractLastFrame('https://cdn.x.com/clip.mp4');
    proc.stdout.emit('data', Buffer.from('JPEG'));
    proc.stdout.emit('data', Buffer.from('DATA'));
    proc.emit('close', 0);
    await expect(promise).resolves.toEqual({
      mimeType: 'image/jpeg',
      base64: Buffer.from('JPEGDATA').toString('base64'),
    });
    expect(spawnMock).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-sseof', '-0.5', '-i', 'https://cdn.x.com/clip.mp4'])
    );
  });

  it('rechaza cuando ffmpeg sale con codigo != 0', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc);
    const promise = extractLastFrame('https://cdn.x.com/clip.mp4');
    proc.emit('close', 1);
    await expect(promise).rejects.toThrow('ffmpeg failed');
  });

  it('rechaza cuando ffmpeg no produce salida', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc);
    const promise = extractLastFrame('https://cdn.x.com/clip.mp4');
    proc.emit('close', 0);
    await expect(promise).rejects.toThrow('ffmpeg failed');
  });

  it('rechaza cuando spawn emite error (ffmpeg no instalado)', async () => {
    const proc = fakeProcess();
    spawnMock.mockReturnValue(proc);
    const promise = extractLastFrame('https://cdn.x.com/clip.mp4');
    proc.emit('error', new Error('spawn ffmpeg ENOENT'));
    await expect(promise).rejects.toThrow('ENOENT');
  });
});
