import { spawn } from 'child_process';
import type { ImageReference } from '../ai.interfaces';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv']);

export function isVideoPath(path: string): boolean {
  const clean = path.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.has(ext);
}

// Extrae el ultimo frame de un video (URL http(s) accesible por el backend)
// como jpeg base64. Usa -sseof para buscar desde el final sin decodificar todo.
export function extractLastFrame(
  url: string,
  timeoutMs = 60_000
): Promise<ImageReference> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-sseof', '-0.5',
      '-i', url,
      '-frames:v', '1',
      '-q:v', '2',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ]);
    // Drena stderr para evitar deadlock si ffmpeg llena el pipe buffer
    ff.stderr.resume();
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      settle(() =>
        reject(new Error('ffmpeg timed out extracting last frame'))
      );
    }, timeoutMs);
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(err));
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      settle(() => {
        const buf = Buffer.concat(chunks);
        if (code !== 0 || buf.length === 0) {
          return reject(
            new Error(`ffmpeg failed to extract last frame (exit ${code})`)
          );
        }
        resolve({ mimeType: 'image/jpeg', base64: buf.toString('base64') });
      });
    });
  });
}
