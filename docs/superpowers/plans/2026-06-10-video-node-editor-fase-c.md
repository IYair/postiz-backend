# Fase C — Editor de nodos Texto→Imagen→Vídeo: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editor de nodos (canvas @xyflow/react) que encadena Prompt→Imagen→Vídeo con continuidad entre clips (último frame del clip anterior → primer frame del siguiente) y referencias compartidas, ejecutando el grafo client-side sobre los endpoints de Fases A/B.

**Architecture:** El frontend ejecuta el grafo en orden topológico llamando endpoints existentes (`/media/generate-image-with-prompt`, `/media/ai-video` + polling). El backend solo agrega un endpoint `POST /media/reference-from-media` que convierte una media en `{ mimeType, base64 }` (si es vídeo, extrae el último frame con ffmpeg). Diseño completo en `docs/superpowers/specs/2026-06-10-video-node-editor-fase-c-design.md`.

**Tech Stack:** NestJS + Prisma + ffmpeg (spawn) en backend; Next.js 16 + React 19 + `@xyflow/react` + zustand + Tailwind en frontend; vitest en ambos (`pnpm exec vitest run <path>`, imports relativos — los alias `@gitroom/*` NO resuelven en vitest zero-config).

**Repos:** Tareas 1–5 en `postiz-backend`; tareas 6–12 en `postiz-frontend`. Crear una rama por repo (p.ej. `feature/video-node-editor`). Commits convencionales, **sin** Co-Authored-By. PRs con `--repo IYair/postiz-backend|postiz-frontend --base main` (nunca al upstream).

---

## Parte 1 — Backend (`/Users/yairchan/Proyectos/Social Media/postiz-backend`)

### Task 1: Fix orden de rutas POST en media.controller (bug latente Fase B)

`@Post('/:endpoint')` (catch-all de R2 upload) está declarado ANTES de `@Post('/ai-video')`. Express matchea en orden de declaración, así que `POST /media/ai-video` cae en `handleR2Upload`. Hay que mover el handler arriba.

**Files:**
- Modify: `apps/backend/src/api/routes/media.controller.ts`

- [ ] **Step 1: Localizar los bloques**

Abrir `apps/backend/src/api/routes/media.controller.ts`. Verificar que `@Post('/:endpoint')` (método `uploadFile`, ~línea 216) aparece antes que `@Post('/ai-video')` (método `aiVideo`, ~línea 272). Si ya está arreglado (ai-video antes del catch-all), saltar a Task 2.

- [ ] **Step 2: Mover el bloque `@Post('/ai-video')` completo**

Cortar el método `aiVideo` completo (desde `@Post('/ai-video')` hasta su `}` de cierre, ~líneas 272–324) y pegarlo INMEDIATAMENTE ANTES de `@Post('/:endpoint')`. El método `@Get('/ai-video/:jobId')` puede quedarse donde está (no hay `@Get` catch-all), pero muévelo junto al POST para mantener cohesión. No cambiar ni una línea del cuerpo de los métodos — solo reubicarlos.

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm build:backend`
Expected: build OK sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/api/routes/media.controller.ts
git commit -m "fix(media): declare ai-video routes before /:endpoint catch-all"
```

---

### Task 2: ffmpeg en la imagen Docker (runner)

**Files:**
- Modify: `Dockerfile.backend` (stage `runner`, apt-get ~línea 62)

- [ ] **Step 1: Agregar ffmpeg al apt del stage runner**

En `Dockerfile.backend`, el stage `runner` tiene:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx tini ca-certificates openssl curl \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
 && rm -rf /var/lib/apt/lists/*
```

Cambiarlo a:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx tini ca-certificates openssl curl ffmpeg \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
 && rm -rf /var/lib/apt/lists/*
```

(NO tocar el apt del stage `builder-base` — ffmpeg solo se necesita en runtime.)

- [ ] **Step 2: Verificar ffmpeg local para el smoke posterior**

Run: `which ffmpeg || echo "FALTA: brew install ffmpeg"`
Expected: ruta de ffmpeg. Si falta y se va a hacer smoke local, instalarlo (`brew install ffmpeg`).

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.backend
git commit -m "build(docker): add ffmpeg to runner image for video frame extraction"
```

---

### Task 3: Helpers `isVideoPath` + `extractLastFrame` (TDD)

**Files:**
- Create: `libraries/nestjs-libraries/src/ai/video/media-reference.helpers.ts`
- Test: `libraries/nestjs-libraries/src/ai/__tests__/media-reference.helpers.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `libraries/nestjs-libraries/src/ai/__tests__/media-reference.helpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/media-reference.helpers.test.ts`
Expected: FAIL — `Cannot find module '../video/media-reference.helpers'` (o similar).

- [ ] **Step 3: Implementar los helpers**

Crear `libraries/nestjs-libraries/src/ai/video/media-reference.helpers.ts`:

```ts
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
      '-sseof', '-0.5',
      '-i', url,
      '-frames:v', '1',
      '-q:v', '2',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('ffmpeg timed out extracting last frame'));
    }, timeoutMs);
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (code !== 0 || buf.length === 0) {
        return reject(
          new Error(`ffmpeg failed to extract last frame (exit ${code})`)
        );
      }
      resolve({ mimeType: 'image/jpeg', base64: buf.toString('base64') });
    });
  });
}
```

Nota: `import type` para `ImageReference` (vitest zero-config no resuelve alias; el import relativo de tipos compila sin problema).

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/media-reference.helpers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/video/media-reference.helpers.ts libraries/nestjs-libraries/src/ai/__tests__/media-reference.helpers.test.ts
git commit -m "feat(ai): add isVideoPath and extractLastFrame helpers"
```

---

### Task 4: `MediaService.mediaAsReference` + endpoint `POST /media/reference-from-media`

**Files:**
- Create: `libraries/nestjs-libraries/src/dtos/media/media-reference.dto.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts`
- Modify: `apps/backend/src/api/routes/media.controller.ts`

- [ ] **Step 1: Crear el DTO**

Crear `libraries/nestjs-libraries/src/dtos/media/media-reference.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class MediaReferenceDto {
  @IsString()
  @MinLength(1)
  mediaId: string;
}
```

- [ ] **Step 2: Agregar `mediaAsReference` a MediaService**

En `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts`, agregar import arriba:

```ts
import {
  isVideoPath,
  extractLastFrame,
} from '@gitroom/nestjs-libraries/ai/video/media-reference.helpers';
```

Y agregar el método (después de `getMediaById`, ~línea 43):

```ts
  // Convierte una media propia de la org en una referencia { mimeType, base64 }.
  // Para videos extrae el ULTIMO frame (encadenado de clips del editor de nodos).
  // No aplica el guard SSRF de fetchAsReference: la URL viene de nuestra DB
  // (media.path), y el guard rechazaria http://localhost en dev.
  async mediaAsReference(
    orgId: string,
    mediaId: string
  ): Promise<{ mimeType: string; base64: string } | null> {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media || media.organizationId !== orgId) {
      return null;
    }
    if (isVideoPath(media.path)) {
      return extractLastFrame(media.path);
    }
    const resp = await fetch(media.path);
    if (!resp.ok) {
      throw new Error('Failed to download media for reference');
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    return {
      mimeType: resp.headers.get('content-type') || 'image/png',
      base64: buffer.toString('base64'),
    };
  }
```

- [ ] **Step 3: Agregar el endpoint al controller**

En `apps/backend/src/api/routes/media.controller.ts`:

Import del DTO junto a los demás imports de dtos:

```ts
import { MediaReferenceDto } from '@gitroom/nestjs-libraries/dtos/media/media-reference.dto';
```

Agregar el handler INMEDIATAMENTE ANTES de `@Post('/:endpoint')` (misma zona donde quedó `@Post('/ai-video')` tras Task 1 — cualquier POST nuevo declarado después del catch-all es inalcanzable):

```ts
  @Post('/reference-from-media')
  async referenceFromMedia(
    @GetOrgFromRequest() org: Organization,
    @Body() body: MediaReferenceDto
  ) {
    const ref = await this._mediaService.mediaAsReference(org.id, body.mediaId);
    if (!ref) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    return ref;
  }
```

(`HttpException`, `HttpStatus`, `Organization` y `GetOrgFromRequest` ya están importados en este controller — verificar y no duplicar.)

- [ ] **Step 4: Typecheck + suite completa**

Run: `pnpm build:backend && pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/`
Expected: build OK; todos los tests de `__tests__` PASS.

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/dtos/media/media-reference.dto.ts libraries/nestjs-libraries/src/database/prisma/media/media.service.ts apps/backend/src/api/routes/media.controller.ts
git commit -m "feat(media): add reference-from-media endpoint (last-frame extraction)"
```

---

### Task 5: Smoke backend (opcional si no hay entorno local levantado)

- [ ] **Step 1: Smoke manual del endpoint**

Con backend local corriendo y una media de vídeo existente (de Fase B):

```bash
curl -s -X POST http://localhost:3000/api/media/reference-from-media \
  -H "Content-Type: application/json" -H "auth: <token>" \
  -d '{"mediaId":"<id de un video en media library>"}' | head -c 200
```

Expected: JSON `{"mimeType":"image/jpeg","base64":"/9j/..."}`. Con un `mediaId` inexistente: 404.
Si no hay entorno local, diferir al smoke de deploy (el typecheck + tests de Task 3/4 cubren la lógica).

---

## Parte 2 — Frontend (`/Users/yairchan/Proyectos/Social Media/postiz-frontend`)

### Task 6: Dependencia, página, menú y canvas vacío

**Files:**
- Modify: `package.json` (root, vía pnpm)
- Create: `apps/frontend/src/app/(app)/(site)/video-flow/page.tsx`
- Create: `apps/frontend/src/components/video-flow/video-flow.component.tsx`
- Modify: `apps/frontend/src/components/layout/top.menu.tsx`

- [ ] **Step 1: Instalar @xyflow/react**

Run (en la raíz del repo frontend): `pnpm add @xyflow/react -w`
Expected: aparece en `dependencies` del `package.json` raíz.

- [ ] **Step 2: Crear la página**

Crear `apps/frontend/src/app/(app)/(site)/video-flow/page.tsx`. Copiar la estructura EXACTA de `apps/frontend/src/app/(app)/(site)/video-generator/page.tsx` (mismos exports/metadata, es la convención del repo), cambiando el componente:

```tsx
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { VideoFlowComponent } from '@gitroom/frontend/components/video-flow/video-flow.component';

export const metadata: Metadata = {
  title: 'Postiz - Video Flow',
  description: '',
};

export default async function Page() {
  return <VideoFlowComponent />;
}
```

(Si `video-generator/page.tsx` difiere de este esqueleto — p.ej. usa `isGeneral()` o helpers de metadata — replicar lo que haga ese archivo.)

- [ ] **Step 3: Componente con canvas vacío**

Crear `apps/frontend/src/components/video-flow/video-flow.component.tsx`:

```tsx
'use client';

import React from 'react';
import { ReactFlow, Background, Controls, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const VideoFlowComponent: React.FC = () => {
  const t = useT();
  return (
    <div className="flex flex-col gap-[12px] flex-1">
      <div className="text-[20px] font-medium">
        {t('video_flow', 'Video Flow')}
      </div>
      <div className="flex-1 min-h-[600px] border-newTableBorder border rounded-[8px] overflow-hidden">
        <ReactFlowProvider>
          <ReactFlow nodes={[]} edges={[]} fitView colorMode="dark">
            <Background />
            <Controls />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
};

export default VideoFlowComponent;
```

- [ ] **Step 4: Entrada en el menú**

En `apps/frontend/src/components/layout/top.menu.tsx`, dentro de `firstMenu`, duplicar el item de Video Generator (~líneas 117–137) justo después de él, cambiando SOLO `name` y `path` (reusar el MISMO `<svg>` del item video_generator — no crear SVGs nuevos):

```tsx
    {
      name: t('video_flow', 'Video Flow'),
      icon: (
        /* mismo <svg> que el item video_generator: copiarlo tal cual */
      ),
      path: '/video-flow',
    },
```

- [ ] **Step 5: Verificar que compila y renderiza**

Run: `pnpm build:frontend` (o `pnpm dev:frontend` y abrir `http://localhost:4200/video-flow`)
Expected: build OK; la página muestra el canvas vacío con grid y controles, item "Video Flow" en el menú.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml apps/frontend/src/app/\(app\)/\(site\)/video-flow/page.tsx apps/frontend/src/components/video-flow/video-flow.component.tsx apps/frontend/src/components/layout/top.menu.tsx
git commit -m "feat(video-flow): add page, menu entry and empty xyflow canvas"
```

---

### Task 7: Lógica pura del grafo `flow-logic.ts` (TDD)

**Files:**
- Create: `apps/frontend/src/components/video-flow/flow-logic.ts`
- Test: `apps/frontend/src/components/video-flow/__tests__/flow-logic.test.ts`

IMPORTANTE: `flow-logic.ts` NO importa nada de `@xyflow/react` ni alias `@gitroom/*` — es lógica pura con tipos propios, para que vitest zero-config la corra.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/frontend/src/components/video-flow/__tests__/flow-logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateConnection,
  wouldCreateCycle,
  topologicalOrder,
  resolveVideoMode,
  HANDLE,
  type FlowNodeLite,
  type FlowEdgeLite,
} from '../flow-logic';

const nodes: FlowNodeLite[] = [
  { id: 't1', type: 'text' },
  { id: 'i1', type: 'image' },
  { id: 'i2', type: 'image' },
  { id: 'v1', type: 'video' },
  { id: 'v2', type: 'video' },
];

const edge = (
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): FlowEdgeLite => ({ source, sourceHandle, target, targetHandle });

describe('validateConnection', () => {
  it('acepta los pares de handles permitidos', () => {
    expect(validateConnection(edge('t1', HANDLE.promptOut, 'v1', HANDLE.promptIn), nodes, [])).toBeNull();
    expect(validateConnection(edge('t1', HANDLE.promptOut, 'i1', HANDLE.promptIn), nodes, [])).toBeNull();
    expect(validateConnection(edge('i1', HANDLE.imageOut, 'v1', HANDLE.startIn), nodes, [])).toBeNull();
    expect(validateConnection(edge('v1', HANDLE.videoOut, 'v2', HANDLE.startIn), nodes, [])).toBeNull();
    expect(validateConnection(edge('i1', HANDLE.imageOut, 'v1', HANDLE.refIn), nodes, [])).toBeNull();
  });

  it('rechaza pares incompatibles y self-connections', () => {
    expect(validateConnection(edge('t1', HANDLE.promptOut, 'v1', HANDLE.startIn), nodes, [])).toBe('incompatible connection');
    expect(validateConnection(edge('v1', HANDLE.videoOut, 'v1', HANDLE.startIn), nodes, [])).toBe('cannot connect a node to itself');
    expect(validateConnection(edge('v1', HANDLE.videoOut, 'v2', HANDLE.refIn), nodes, [])).toBe('incompatible connection');
  });

  it('limita prompt-in y start-in a 1 edge', () => {
    const existing = [edge('t1', HANDLE.promptOut, 'v1', HANDLE.promptIn)];
    expect(validateConnection(edge('t1', HANDLE.promptOut, 'v1', HANDLE.promptIn), nodes, existing)).toBe('prompt input already connected');
    const existingStart = [edge('i1', HANDLE.imageOut, 'v1', HANDLE.startIn)];
    expect(validateConnection(edge('i2', HANDLE.imageOut, 'v1', HANDLE.startIn), nodes, existingStart)).toBe('start frame input already connected');
  });

  it('limita ref-in a 3 edges', () => {
    const refs = [
      edge('i1', HANDLE.imageOut, 'v1', HANDLE.refIn),
      edge('i2', HANDLE.imageOut, 'v1', HANDLE.refIn),
      edge('i1', HANDLE.imageOut, 'v1', HANDLE.refIn),
    ];
    expect(validateConnection(edge('i2', HANDLE.imageOut, 'v1', HANDLE.refIn), nodes, refs)).toBe('max 3 reference images');
  });

  it('start-in y ref-in son excluyentes (restriccion SDK Veo)', () => {
    const withStart = [edge('i1', HANDLE.imageOut, 'v1', HANDLE.startIn)];
    expect(validateConnection(edge('i2', HANDLE.imageOut, 'v1', HANDLE.refIn), nodes, withStart)).toBe('references and start frame are mutually exclusive');
    const withRef = [edge('i1', HANDLE.imageOut, 'v1', HANDLE.refIn)];
    expect(validateConnection(edge('i2', HANDLE.imageOut, 'v1', HANDLE.startIn), nodes, withRef)).toBe('references and start frame are mutually exclusive');
  });

  it('rechaza ciclos', () => {
    const chain = [edge('v1', HANDLE.videoOut, 'v2', HANDLE.startIn)];
    expect(validateConnection(edge('v2', HANDLE.videoOut, 'v1', HANDLE.startIn), nodes, chain)).toBe('connection would create a cycle');
  });
});

describe('wouldCreateCycle', () => {
  it('detecta ciclo transitivo', () => {
    const edges = [
      edge('v1', HANDLE.videoOut, 'v2', HANDLE.startIn),
    ];
    expect(wouldCreateCycle(edge('v2', HANDLE.videoOut, 'v1', HANDLE.startIn), edges)).toBe(true);
    expect(wouldCreateCycle(edge('i1', HANDLE.imageOut, 'v1', HANDLE.startIn), edges)).toBe(false);
  });
});

describe('topologicalOrder', () => {
  it('ordena dependencias antes que dependientes', () => {
    const edges = [
      edge('t1', HANDLE.promptOut, 'i1', HANDLE.promptIn),
      edge('i1', HANDLE.imageOut, 'v1', HANDLE.startIn),
      edge('v1', HANDLE.videoOut, 'v2', HANDLE.startIn),
    ];
    const order = topologicalOrder(nodes, edges);
    expect(order.indexOf('t1')).toBeLessThan(order.indexOf('i1'));
    expect(order.indexOf('i1')).toBeLessThan(order.indexOf('v1'));
    expect(order.indexOf('v1')).toBeLessThan(order.indexOf('v2'));
    expect(order).toHaveLength(5);
  });

  it('lanza si hay ciclo', () => {
    const cyclic = [
      edge('v1', HANDLE.videoOut, 'v2', HANDLE.startIn),
      edge('v2', HANDLE.videoOut, 'v1', HANDLE.startIn),
    ];
    expect(() => topologicalOrder(nodes, cyclic)).toThrow('cycle');
  });
});

describe('resolveVideoMode', () => {
  it('ingredients > frames > text', () => {
    expect(resolveVideoMode(false, 2)).toBe('ingredients');
    expect(resolveVideoMode(true, 0)).toBe('frames');
    expect(resolveVideoMode(false, 0)).toBe('text');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm exec vitest run apps/frontend/src/components/video-flow/__tests__/flow-logic.test.ts`
Expected: FAIL — módulo `../flow-logic` no existe.

- [ ] **Step 3: Implementar `flow-logic.ts`**

Crear `apps/frontend/src/components/video-flow/flow-logic.ts`:

```ts
// Logica pura del grafo del editor de nodos. Sin imports de @xyflow ni
// alias @gitroom/* para que vitest zero-config pueda ejecutarla.

export interface ImageRef {
  mimeType: string;
  base64: string;
}

export type FlowNodeType = 'text' | 'image' | 'video';
export type NodeStatus = 'idle' | 'running' | 'done' | 'error';
export type VideoNodeMode = 'text' | 'frames' | 'ingredients';

export interface FlowNodeLite {
  id: string;
  type: FlowNodeType;
}

export interface FlowEdgeLite {
  id?: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}

export const HANDLE = {
  promptOut: 'prompt-out',
  imageOut: 'image-out',
  videoOut: 'video-out',
  promptIn: 'prompt-in',
  startIn: 'start-in',
  refIn: 'ref-in',
} as const;

export const MAX_REFERENCE_EDGES = 3;

const ALLOWED_PAIRS = new Set([
  `${HANDLE.promptOut}->${HANDLE.promptIn}`,
  `${HANDLE.imageOut}->${HANDLE.startIn}`,
  `${HANDLE.videoOut}->${HANDLE.startIn}`,
  `${HANDLE.imageOut}->${HANDLE.refIn}`,
]);

// Devuelve un mensaje de error, o null si la conexion es valida.
export function validateConnection(
  conn: FlowEdgeLite,
  nodes: FlowNodeLite[],
  edges: FlowEdgeLite[]
): string | null {
  const source = nodes.find((n) => n.id === conn.source);
  const target = nodes.find((n) => n.id === conn.target);
  if (!source || !target) return 'invalid nodes';
  if (conn.source === conn.target) return 'cannot connect a node to itself';

  if (!ALLOWED_PAIRS.has(`${conn.sourceHandle}->${conn.targetHandle}`)) {
    return 'incompatible connection';
  }

  const targetEdges = edges.filter((e) => e.target === conn.target);
  const th = conn.targetHandle;

  if (
    th === HANDLE.promptIn &&
    targetEdges.some((e) => e.targetHandle === HANDLE.promptIn)
  ) {
    return 'prompt input already connected';
  }
  if (
    th === HANDLE.startIn &&
    targetEdges.some((e) => e.targetHandle === HANDLE.startIn)
  ) {
    return 'start frame input already connected';
  }
  if (
    th === HANDLE.refIn &&
    targetEdges.filter((e) => e.targetHandle === HANDLE.refIn).length >=
      MAX_REFERENCE_EDGES
  ) {
    return `max ${MAX_REFERENCE_EDGES} reference images`;
  }
  // Restriccion del SDK Veo: referenceImages no admite image/lastFrame.
  if (
    th === HANDLE.startIn &&
    targetEdges.some((e) => e.targetHandle === HANDLE.refIn)
  ) {
    return 'references and start frame are mutually exclusive';
  }
  if (
    th === HANDLE.refIn &&
    targetEdges.some((e) => e.targetHandle === HANDLE.startIn)
  ) {
    return 'references and start frame are mutually exclusive';
  }

  if (wouldCreateCycle(conn, edges)) return 'connection would create a cycle';
  return null;
}

export function wouldCreateCycle(
  conn: FlowEdgeLite,
  edges: FlowEdgeLite[]
): boolean {
  // Hay ciclo si desde conn.target se alcanza conn.source por edges existentes.
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  }
  const stack = [conn.target];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === conn.source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function topologicalOrder(
  nodes: FlowNodeLite[],
  edges: FlowEdgeLite[]
): string[] {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const queue = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of edges) {
      if (e.source !== id) continue;
      const d = (indegree.get(e.target) ?? 0) - 1;
      indegree.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  if (order.length !== nodes.length) throw new Error('graph has a cycle');
  return order;
}

export function resolveVideoMode(
  hasStart: boolean,
  referenceCount: number
): VideoNodeMode {
  if (referenceCount > 0) return 'ingredients';
  if (hasStart) return 'frames';
  return 'text';
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm exec vitest run apps/frontend/src/components/video-flow/__tests__/flow-logic.test.ts`
Expected: PASS (todos los tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/video-flow/flow-logic.ts apps/frontend/src/components/video-flow/__tests__/flow-logic.test.ts
git commit -m "feat(video-flow): pure graph logic (connection rules, topo order, mode)"
```

---

### Task 8: Store zustand + util de archivos

**Files:**
- Create: `apps/frontend/src/components/video-flow/video-flow.store.ts`
- Create: `apps/frontend/src/components/video-flow/file-utils.ts`

- [ ] **Step 1: Crear `file-utils.ts`**

(Misma lógica que `readFileAsBase64` de `video-generator.component.tsx`, extraída para reuso.)

```ts
import type { ImageRef } from './flow-logic';

export function readFileAsBase64(file: File): Promise<ImageRef> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      resolve({ mimeType: file.type || 'image/png', base64 });
    };
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: Crear el store**

Crear `apps/frontend/src/components/video-flow/video-flow.store.ts`:

```ts
import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import {
  validateConnection,
  type NodeStatus,
  type FlowNodeType,
} from './flow-logic';

const STORAGE_KEY = 'postiz-video-flow-v1';

const DEFAULT_DATA: Record<FlowNodeType, Record<string, any>> = {
  text: { prompt: '' },
  image: {
    source: 'generate',
    prompt: '',
    aspectRatio: 'landscape',
    enhancePrompt: false,
  },
  video: { prompt: '', aspectRatio: '16:9', durationSeconds: 8, seed: '' },
};

function load(): { nodes: Node[]; edges: Edge[] } {
  if (typeof window === 'undefined') return { nodes: [], edges: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], edges: [] };
    const parsed = JSON.parse(raw);
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] };
  } catch {
    return { nodes: [], edges: [] };
  }
}

function persist(nodes: Node[], edges: Edge[]) {
  if (typeof window === 'undefined') return;
  // No persistimos uploads base64: pueden exceder la cuota de localStorage.
  const slim = nodes.map((n) => ({
    ...n,
    data: { ...n.data, upload: undefined },
  }));
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ nodes: slim, edges })
    );
  } catch {
    // cuota llena: el flow sigue en memoria
  }
}

export interface VideoFlowState {
  nodes: Node[];
  edges: Edge[];
  statuses: Record<string, NodeStatus>;
  errors: Record<string, string>;
  running: boolean;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  // Devuelve mensaje de error si la conexion es invalida; null si conecto.
  onConnect: (conn: Connection) => string | null;
  addNode: (type: FlowNodeType) => void;
  updateNodeData: (id: string, data: Record<string, any>) => void;
  setStatus: (id: string, status: NodeStatus, error?: string) => void;
  setRunning: (running: boolean) => void;
  resetRun: () => void;
  clearAll: () => void;
}

let nodeCounter = 1;

export const useVideoFlowStore = create<VideoFlowState>((set, get) => ({
  ...load(),
  statuses: {},
  errors: {},
  running: false,

  onNodesChange: (changes) => {
    const nodes = applyNodeChanges(changes, get().nodes);
    set({ nodes });
    persist(nodes, get().edges);
  },

  onEdgesChange: (changes) => {
    const edges = applyEdgeChanges(changes, get().edges);
    set({ edges });
    persist(get().nodes, edges);
  },

  onConnect: (conn) => {
    const { nodes, edges } = get();
    const lite = nodes.map((n) => ({
      id: n.id,
      type: n.type as FlowNodeType,
    }));
    const error = validateConnection(
      {
        source: conn.source!,
        target: conn.target!,
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
      },
      lite,
      edges
    );
    if (error) return error;
    const next = addEdge(conn, edges);
    set({ edges: next });
    persist(nodes, next);
    return null;
  },

  addNode: (type) => {
    const count = get().nodes.length;
    const node: Node = {
      id: `${type}-${Date.now().toString(36)}-${nodeCounter++}`,
      type,
      position: { x: 80 + (count % 4) * 320, y: 80 + Math.floor(count / 4) * 260 },
      data: { ...DEFAULT_DATA[type] },
    };
    const nodes = [...get().nodes, node];
    set({ nodes });
    persist(nodes, get().edges);
  },

  updateNodeData: (id, data) => {
    const nodes = get().nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...data } } : n
    );
    set({ nodes });
    persist(nodes, get().edges);
  },

  setStatus: (id, status, error) =>
    set((s) => ({
      statuses: { ...s.statuses, [id]: status },
      errors: error
        ? { ...s.errors, [id]: error }
        : (({ [id]: _drop, ...rest }) => rest)(s.errors),
    })),

  setRunning: (running) => set({ running }),

  resetRun: () => set({ statuses: {}, errors: {} }),

  clearAll: () => {
    set({ nodes: [], edges: [], statuses: {}, errors: {} });
    persist([], []);
  },
}));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build:frontend`
Expected: build OK (los archivos aún no se usan desde la página; solo valida tipos).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/video-flow/video-flow.store.ts apps/frontend/src/components/video-flow/file-utils.ts
git commit -m "feat(video-flow): zustand store with localStorage autosave"
```

---

### Task 9: Componentes de nodos

**Files:**
- Create: `apps/frontend/src/components/video-flow/nodes/status.badge.tsx`
- Create: `apps/frontend/src/components/video-flow/nodes/text.node.tsx`
- Create: `apps/frontend/src/components/video-flow/nodes/image.node.tsx`
- Create: `apps/frontend/src/components/video-flow/nodes/video.node.tsx`

Notas transversales: clase `nodrag` en inputs/textareas/selects (si no, arrastran el nodo); estilos con las clases del tema (`bg-newBgColorInner`, `border-newTableBorder`, `text-customColor18`) como en `video-generator.component.tsx`.

- [ ] **Step 1: StatusBadge**

`nodes/status.badge.tsx`:

```tsx
'use client';

import React from 'react';
import { useVideoFlowStore } from '../video-flow.store';

const COLORS: Record<string, string> = {
  idle: 'bg-newTableBorder',
  running: 'bg-yellow-600',
  done: 'bg-green-600',
  error: 'bg-red-600',
};

export const StatusBadge: React.FC<{ id: string }> = ({ id }) => {
  const status = useVideoFlowStore((s) => s.statuses[id] || 'idle');
  const error = useVideoFlowStore((s) => s.errors[id]);
  return (
    <div
      title={error}
      className={`px-[8px] h-[20px] rounded-[6px] text-[11px] text-white flex items-center ${COLORS[status]}`}
    >
      {status}
    </div>
  );
};
```

- [ ] **Step 2: TextNode**

`nodes/text.node.tsx`:

```tsx
'use client';

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useVideoFlowStore } from '../video-flow.store';
import { HANDLE } from '../flow-logic';
import { StatusBadge } from './status.badge';

export const TextNode: React.FC<NodeProps> = ({ id, data }) => {
  const updateNodeData = useVideoFlowStore((s) => s.updateNodeData);
  return (
    <div className="w-[260px] bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[12px] flex flex-col gap-[8px]">
      <div className="flex justify-between items-center">
        <div className="text-[13px] font-medium">Prompt</div>
        <StatusBadge id={id} />
      </div>
      <textarea
        value={(data as any).prompt || ''}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="Describe the scene..."
        className="nodrag min-h-[80px] bg-newBgColorInner p-[8px] outline-none border-newTableBorder border rounded-[6px] text-[12px]"
      />
      <Handle type="source" position={Position.Right} id={HANDLE.promptOut} />
    </div>
  );
};
```

- [ ] **Step 3: ImageNode**

`nodes/image.node.tsx`:

```tsx
'use client';

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useVideoFlowStore } from '../video-flow.store';
import { HANDLE } from '../flow-logic';
import { readFileAsBase64 } from '../file-utils';
import { StatusBadge } from './status.badge';

const selectCls =
  'nodrag h-[32px] bg-newBgColorInner px-[8px] border-newTableBorder border rounded-[6px] text-[12px]';

export const ImageNode: React.FC<NodeProps> = ({ id, data }) => {
  const updateNodeData = useVideoFlowStore((s) => s.updateNodeData);
  const hasPromptEdge = useVideoFlowStore((s) =>
    s.edges.some((e) => e.target === id && e.targetHandle === HANDLE.promptIn)
  );
  const d: any = data;

  const pickFile = useCallback(
    async (f?: File) => {
      if (f) updateNodeData(id, { upload: await readFileAsBase64(f) });
    },
    [id, updateNodeData]
  );

  const preview =
    d.resultPath ||
    (d.upload ? `data:${d.upload.mimeType};base64,${d.upload.base64}` : null);

  return (
    <div className="w-[280px] bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[12px] flex flex-col gap-[8px]">
      <div className="flex justify-between items-center">
        <div className="text-[13px] font-medium">Image</div>
        <StatusBadge id={id} />
      </div>

      <select
        value={d.source}
        onChange={(e) => updateNodeData(id, { source: e.target.value })}
        className={selectCls}
      >
        <option value="generate">Generate with AI</option>
        <option value="upload">Upload</option>
      </select>

      {d.source === 'generate' ? (
        <>
          {!hasPromptEdge && (
            <textarea
              value={d.prompt || ''}
              onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
              placeholder="Image prompt (or connect a Prompt node)"
              className="nodrag min-h-[60px] bg-newBgColorInner p-[8px] outline-none border-newTableBorder border rounded-[6px] text-[12px]"
            />
          )}
          <select
            value={d.aspectRatio || 'landscape'}
            onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            className={selectCls}
          >
            <option value="square">Square</option>
            <option value="landscape">Landscape (16:9)</option>
            <option value="portrait">Portrait</option>
            <option value="story">Story (9:16)</option>
          </select>
          <label className="nodrag flex items-center gap-[6px] text-[12px]">
            <input
              type="checkbox"
              checked={!!d.enhancePrompt}
              onChange={(e) =>
                updateNodeData(id, { enhancePrompt: e.target.checked })
              }
            />
            Enhance prompt with AI
          </label>
        </>
      ) : (
        <input
          type="file"
          accept="image/*"
          onChange={(e) => pickFile(e.target.files?.[0])}
          className="nodrag text-[12px]"
        />
      )}

      {preview && (
        <img src={preview} alt="" className="rounded-[6px] max-h-[120px] object-cover" />
      )}

      <Handle type="target" position={Position.Left} id={HANDLE.promptIn} />
      <Handle type="source" position={Position.Right} id={HANDLE.imageOut} />
    </div>
  );
};
```

- [ ] **Step 4: VideoNode**

`nodes/video.node.tsx`:

```tsx
'use client';

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useVideoFlowStore } from '../video-flow.store';
import { HANDLE, resolveVideoMode } from '../flow-logic';
import { StatusBadge } from './status.badge';

const selectCls =
  'nodrag h-[32px] bg-newBgColorInner px-[8px] border-newTableBorder border rounded-[6px] text-[12px]';

export const VideoNode: React.FC<NodeProps> = ({ id, data }) => {
  const updateNodeData = useVideoFlowStore((s) => s.updateNodeData);
  const incoming = useVideoFlowStore((s) =>
    s.edges.filter((e) => e.target === id)
  );
  const d: any = data;

  const hasPromptEdge = incoming.some((e) => e.targetHandle === HANDLE.promptIn);
  const hasStart = incoming.some((e) => e.targetHandle === HANDLE.startIn);
  const refCount = incoming.filter((e) => e.targetHandle === HANDLE.refIn).length;
  const mode = resolveVideoMode(hasStart, refCount);

  return (
    <div className="w-[300px] bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[12px] flex flex-col gap-[8px]">
      <div className="flex justify-between items-center">
        <div className="text-[13px] font-medium">
          Video <span className="text-customColor18 text-[11px]">({mode})</span>
        </div>
        <StatusBadge id={id} />
      </div>

      {!hasPromptEdge && (
        <textarea
          value={d.prompt || ''}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="Video prompt (or connect a Prompt node)"
          className="nodrag min-h-[60px] bg-newBgColorInner p-[8px] outline-none border-newTableBorder border rounded-[6px] text-[12px]"
        />
      )}

      <div className="flex gap-[8px]">
        <select
          value={d.aspectRatio || '16:9'}
          onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
          className={`${selectCls} flex-1`}
        >
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="auto">Auto</option>
        </select>
        <select
          value={d.durationSeconds || 8}
          onChange={(e) =>
            updateNodeData(id, { durationSeconds: parseInt(e.target.value, 10) })
          }
          className={`${selectCls} flex-1`}
        >
          <option value={4}>4s</option>
          <option value={6}>6s</option>
          <option value={8}>8s</option>
        </select>
        <input
          value={d.seed || ''}
          onChange={(e) => updateNodeData(id, { seed: e.target.value })}
          placeholder="seed"
          className={`${selectCls} w-[70px]`}
        />
      </div>

      <input
        value={d.negativePrompt || ''}
        onChange={(e) => updateNodeData(id, { negativePrompt: e.target.value })}
        placeholder="Negative prompt (optional)"
        className={selectCls}
      />

      {d.resultPath && (
        <video src={d.resultPath} controls className="rounded-[6px] max-h-[160px]" />
      )}

      <Handle type="target" position={Position.Left} id={HANDLE.promptIn} style={{ top: '25%' }} />
      <Handle type="target" position={Position.Left} id={HANDLE.startIn} style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left} id={HANDLE.refIn} style={{ top: '75%' }} />
      <Handle type="source" position={Position.Right} id={HANDLE.videoOut} />
    </div>
  );
};
```

- [ ] **Step 5: Typecheck**

Run: `pnpm build:frontend`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/video-flow/nodes/
git commit -m "feat(video-flow): text, image and video node components"
```

---

### Task 10: Motor de ejecución `run-flow.ts`

**Files:**
- Create: `apps/frontend/src/components/video-flow/run-flow.ts`

- [ ] **Step 1: Implementar el hook `useRunFlow`**

```ts
'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useVideoFlowStore } from './video-flow.store';
import {
  topologicalOrder,
  resolveVideoMode,
  HANDLE,
  type ImageRef,
  type FlowNodeType,
} from './flow-logic';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 180; // ~15 min por clip, igual que el timeout del workflow

interface NodeOutput {
  prompt?: string;
  mediaId?: string;
  path?: string;
  ref?: ImageRef;
}

export const useRunFlow = () => {
  const fetch = useFetch();
  const toaster = useToaster();

  return useCallback(async () => {
    const store = useVideoFlowStore.getState();
    const { nodes, edges } = store;
    if (!nodes.length) return;
    store.resetRun();
    store.setRunning(true);

    const outputs: Record<string, NodeOutput> = {};

    // Resuelve una media (imagen generada o video previo) a { mimeType, base64 }.
    // Para videos el backend extrae el ULTIMO frame (encadenado de clips).
    const mediaAsRef = async (mediaId: string): Promise<ImageRef> => {
      const res = await fetch('/media/reference-from-media', {
        method: 'POST',
        body: JSON.stringify({ mediaId }),
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error('Failed to resolve media reference');
      }
      return res.json();
    };

    const resolveIncomingRef = async (sourceId: string): Promise<ImageRef> => {
      const out = outputs[sourceId];
      if (out?.ref) return out.ref;
      if (out?.mediaId) return mediaAsRef(out.mediaId);
      throw new Error('Upstream node produced no output');
    };

    const pollVideoJob = async (jobId: string) => {
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const res = await (await fetch(`/media/ai-video/${jobId}`)).json();
        if (res.status === 'done') {
          return res.media as { id: string; path: string }[];
        }
        if (res.status === 'error') {
          throw new Error(res.error || 'Video generation failed');
        }
      }
      throw new Error('Video generation timed out');
    };

    const runImageNode = async (id: string, data: any, incoming: any[]) => {
      if (data.source === 'upload') {
        if (!data.upload) throw new Error('Image node has no uploaded file');
        outputs[id] = { ref: data.upload };
        return;
      }
      const promptEdge = incoming.find(
        (e) => e.targetHandle === HANDLE.promptIn
      );
      const prompt = promptEdge
        ? outputs[promptEdge.source]?.prompt
        : data.prompt;
      if (!prompt) throw new Error('Image node needs a prompt');
      const res = await fetch('/media/generate-image-with-prompt', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          aspectRatio: data.aspectRatio || 'landscape',
          skipExpansion: !data.enhancePrompt,
        }),
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error((await res.text()) || 'Image generation failed');
      }
      const media = await res.json();
      if (!media) throw new Error('Image generation failed (no credits?)');
      outputs[id] = { mediaId: media.id, path: media.path };
      useVideoFlowStore
        .getState()
        .updateNodeData(id, { resultMediaId: media.id, resultPath: media.path });
    };

    const runVideoNode = async (id: string, data: any, incoming: any[]) => {
      const promptEdge = incoming.find(
        (e) => e.targetHandle === HANDLE.promptIn
      );
      const startEdge = incoming.find(
        (e) => e.targetHandle === HANDLE.startIn
      );
      const refEdges = incoming.filter(
        (e) => e.targetHandle === HANDLE.refIn
      );

      const prompt =
        (promptEdge ? outputs[promptEdge.source]?.prompt : data.prompt) || '';
      const mode = resolveVideoMode(!!startEdge, refEdges.length);

      const body: any = {
        mode,
        aspectRatio: data.aspectRatio || '16:9',
        durationSeconds: data.durationSeconds || 8,
        numberOfVideos: 1,
      };
      if (prompt) body.prompt = prompt;
      if (data.seed) body.seed = parseInt(String(data.seed), 10);
      if (data.negativePrompt) body.negativePrompt = data.negativePrompt;
      if (startEdge) body.startImage = await resolveIncomingRef(startEdge.source);
      if (refEdges.length) {
        body.referenceImages = await Promise.all(
          refEdges.map((e: any) => resolveIncomingRef(e.source))
        );
      }

      const res = await fetch('/media/ai-video', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error((await res.text()) || 'Video generation failed');
      }
      const { jobId } = await res.json();
      const media = await pollVideoJob(jobId);
      if (!media?.length) throw new Error('No video returned');
      outputs[id] = { mediaId: media[0].id, path: media[0].path };
      useVideoFlowStore.getState().updateNodeData(id, {
        resultMediaId: media[0].id,
        resultPath: media[0].path,
      });
    };

    try {
      const lite = nodes.map((n) => ({
        id: n.id,
        type: n.type as FlowNodeType,
      }));
      const order = topologicalOrder(lite, edges);

      for (const id of order) {
        const node = nodes.find((n) => n.id === id)!;
        const data: any = node.data;
        const incoming = edges.filter((e) => e.target === id);

        if (node.type === 'text') {
          outputs[id] = { prompt: data.prompt || '' };
          continue;
        }

        useVideoFlowStore.getState().setStatus(id, 'running');
        try {
          if (node.type === 'image') {
            await runImageNode(id, data, incoming);
          } else {
            await runVideoNode(id, data, incoming);
          }
          useVideoFlowStore.getState().setStatus(id, 'done');
        } catch (err: any) {
          useVideoFlowStore
            .getState()
            .setStatus(id, 'error', err?.message || 'failed');
          throw err;
        }
      }
      toaster.show('Flow completed!', 'success');
    } catch (err: any) {
      toaster.show(err?.message || 'Flow failed', 'warning');
    } finally {
      useVideoFlowStore.getState().setRunning(false);
    }
  }, [fetch, toaster]);
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build:frontend`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/video-flow/run-flow.ts
git commit -m "feat(video-flow): sequential graph execution engine"
```

---

### Task 11: Wiring final del canvas (toolbar, header, créditos)

**Files:**
- Modify: `apps/frontend/src/components/video-flow/video-flow.component.tsx` (reemplazo completo)

- [ ] **Step 1: Reemplazar el componente con la versión final**

```tsx
'use client';

import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useAiConfig } from '@gitroom/frontend/components/settings/ai-provider.component';
import { useVideoFlowStore } from './video-flow.store';
import { useRunFlow } from './run-flow';
import { TextNode } from './nodes/text.node';
import { ImageNode } from './nodes/image.node';
import { VideoNode } from './nodes/video.node';

const nodeTypes = { text: TextNode, image: ImageNode, video: VideoNode };

const FlowCanvas: React.FC = () => {
  const t = useT();
  const toaster = useToaster();
  const runFlow = useRunFlow();

  const { data: aiConfig } = useAiConfig();
  const hasVideoProvider = !!aiConfig?.videoProvider;

  const nodes = useVideoFlowStore((s) => s.nodes);
  const edges = useVideoFlowStore((s) => s.edges);
  const running = useVideoFlowStore((s) => s.running);
  const onNodesChange = useVideoFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useVideoFlowStore((s) => s.onEdgesChange);
  const storeConnect = useVideoFlowStore((s) => s.onConnect);
  const addNode = useVideoFlowStore((s) => s.addNode);
  const clearAll = useVideoFlowStore((s) => s.clearAll);

  const onConnect = useCallback(
    (conn: Connection) => {
      const error = storeConnect(conn);
      if (error) toaster.show(error, 'warning');
    },
    [storeConnect, toaster]
  );

  const videoCredits = useMemo(
    () => nodes.filter((n) => n.type === 'video').length,
    [nodes]
  );

  return (
    <div className="flex flex-col gap-[12px] flex-1">
      <div className="flex items-center gap-[12px]">
        <div className="text-[20px] font-medium">
          {t('video_flow', 'Video Flow')}
        </div>
        {hasVideoProvider ? (
          <div className="text-[13px] text-customColor18">
            {aiConfig?.videoProvider} · {aiConfig?.videoModel}
          </div>
        ) : (
          <div className="text-[13px] text-customColor18">
            {t(
              'video_no_provider',
              'No video provider configured. Set up Google Veo in Settings → AI provider first.'
            )}{' '}
            <a href="/settings" className="underline">
              {t('go_to_settings', 'Go to settings')}
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center gap-[8px]">
        <Button secondary={true} className="rounded-[8px]" onClick={() => addNode('text')}>
          + {t('node_prompt', 'Prompt')}
        </Button>
        <Button secondary={true} className="rounded-[8px]" onClick={() => addNode('image')}>
          + {t('node_image', 'Image')}
        </Button>
        <Button secondary={true} className="rounded-[8px]" onClick={() => addNode('video')}>
          + {t('node_video', 'Video')}
        </Button>
        <div className="flex-1" />
        <div className="text-[12px] text-customColor18">
          {t('credits_required', 'Credits required')}: {videoCredits}
        </div>
        <Button
          className="rounded-[8px]"
          loading={running}
          disabled={!hasVideoProvider || !nodes.length}
          onClick={runFlow}
        >
          {t('run_flow', 'Run Flow')}
        </Button>
        <Button secondary={true} className="rounded-[8px]" onClick={clearAll}>
          {t('clear', 'Clear')}
        </Button>
      </div>

      <div className="flex-1 min-h-[600px] border-newTableBorder border rounded-[8px] overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          colorMode="dark"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};

export const VideoFlowComponent: React.FC = () => (
  <ReactFlowProvider>
    <FlowCanvas />
  </ReactFlowProvider>
);

export default VideoFlowComponent;
```

- [ ] **Step 2: Build + tests**

Run: `pnpm build:frontend && pnpm exec vitest run apps/frontend/src/components/video-flow/__tests__/`
Expected: build OK; tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/video-flow/video-flow.component.tsx
git commit -m "feat(video-flow): wire canvas, toolbar, provider header and credits"
```

---

### Task 12: Smoke manual end-to-end

- [ ] **Step 1: Levantar entorno** (backend + orchestrator + frontend locales, o entorno de staging tras deploy). Requiere Google Veo configurado en Settings → AI provider y ffmpeg disponible donde corre el backend.

- [ ] **Step 2: Checklist de smoke**

1. Abrir `/video-flow` desde el menú. Canvas carga; recargar la página conserva nodos/edges (localStorage).
2. Conexiones inválidas muestran toaster (texto→start, 2 edges a start-in, ref+start a la vez, ciclo video→video→video inicial).
3. Flujo mínimo: Prompt → Video (modo `text`). Run → nodo pasa `running`→`done`, preview reproducible, clip en Media library.
4. Flujo encadenado: Prompt → Video1 → Video2 (`video-out`→`start-in`). Verificar que Video2 arranca DESPUÉS de Video1 y que su primer frame coincide con el último de Video1 (continuidad).
5. Flujo con imagen: Prompt → Image (generate) → Video (`image-out`→`start-in`); modo del nodo = `frames`.
6. Referencias: 2 nodos Image (upload) → `ref-in` de un Video con prompt; modo = `ingredients`.
7. Error path: nodo Video modo `ingredients` sin prompt → nodo en `error` con badge rojo y tooltip; créditos del clip reembolsados (verificar en billing/credits).

- [ ] **Step 3: Ramas y PRs**

Al terminar, usar la skill `superpowers:finishing-a-development-branch`. PRs SIEMPRE con `--repo` y `--base` explícitos:

```bash
# backend
gh pr create --repo IYair/postiz-backend --base main --title "feat: video node editor support (Fase C backend)" --body "..."
# frontend
gh pr create --repo IYair/postiz-frontend --base main --title "feat: video node editor (Fase C)" --body "..."
```

---

## Notas para el ejecutor

- **vitest**: jest NO funciona en estos forks. Siempre `pnpm exec vitest run <ruta>`. Los tests importan de `'vitest'` (sin globals) y usan imports RELATIVOS (los alias `@gitroom/*` no resuelven en vitest zero-config).
- **Typecheck** de código con alias: `pnpm build:backend` / `pnpm build:frontend`.
- **Deploy** (cuando toque): la imagen Docker debe reconstruirse (ffmpeg nuevo). No hay migración Prisma en esta fase.
- **Catch-all `@Post('/:endpoint')`**: cualquier endpoint POST nuevo en `media.controller.ts` debe declararse ANTES de ese método.
