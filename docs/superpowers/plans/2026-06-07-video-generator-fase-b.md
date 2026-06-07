# Fase B — Generador de Vídeos con IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel dedicado que genera videos con Google Veo (proveedor de Fase A) de forma asíncrona (Temporal + polling), en 3 modos (Texto / Fotogramas / Ingredientes), con gating de créditos, guardando el resultado en la media library.

**Architecture:** El backend extiende `GoogleVeoAdapter` para todos los params de Veo y expone `POST /media/ai-video` (encola un workflow Temporal y deduce N créditos) + `GET /media/ai-video/:jobId` (polling). El worker (orchestrator) corre la activity que llama `getVideoProvider().generateVideo()`, guarda los videos en la media library y actualiza el `VideoGenerationJob`. El frontend agrega una página dedicada con el panel y hace polling.

**Tech Stack:** NestJS + Prisma, `@google/genai`, Temporal (`nestjs-temporal-core`, `@temporalio/*`), Next.js/React, vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-video-generator-fase-b-design.md`
**Depende de:** Fase A (en `main`).

---

## Notas de entorno (leer antes de empezar)

- **Repos git separados:** backend `/Users/yairchan/Proyectos/Social Media/postiz-backend`, frontend `/Users/yairchan/Proyectos/Social Media/postiz-frontend`. Commits por repo.
- **Tests = vitest** (jest roto). `pnpm exec vitest run <path>`; importar de `'vitest'`. Para archivos con alias `@gitroom/*`, el gate es `pnpm build:backend` (y `pnpm build:orchestrator` para el worker). El adapter es alias-free (usa `import type`).
- **Prisma:** validar `pnpm dlx prisma@6.5.0 validate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma`; generar `pnpm run prisma-generate`. No `db push` (va en deploy).
- **CLAUDE.md del usuario:** NO crear SVGs. Para iconos de navegación, REUSAR un icono existente del menú (copiar el JSX de uno ya presente), nunca inventar un `<svg>` nuevo.
- **Temporal:** backend = cliente (arranca workflows), orchestrator = worker. Arranque: `this._temporalService.client.getRawClient()?.workflow.start('<workflowFn>', { workflowId, taskQueue: 'main', args: [...] })`.
- **Branch:** trabajar en `feat/video-generator-fase-b` en cada repo (crear con `git checkout -b feat/video-generator-fase-b`).

---

## Estructura de archivos

**Backend (`postiz-backend`):**
- Modificar: `libraries/nestjs-libraries/src/ai/ai.interfaces.ts` — `VideoGenerationResult` → `{ urls: string[] }`.
- Modificar: `libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts` — mapear todos los params + múltiples URLs.
- Modificar: `libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts` — adaptar a `{ urls }` + nuevos params.
- Modificar: `libraries/nestjs-libraries/src/database/prisma/schema.prisma` — modelo `VideoGenerationJob` (+ relación en `Organization`).
- Crear: `libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.repository.ts`
- Crear: `libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.service.ts`
- Crear: `libraries/nestjs-libraries/src/dtos/videos/ai-video.dto.ts`
- Crear: `libraries/nestjs-libraries/src/ai/video/ai-video.helpers.ts` (validación de exclusividad modo↔params) + test.
- Modificar: `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts` — `createCredits`/`deleteCredits`.
- Modificar: `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts` — wrappers.
- Modificar: `apps/backend/src/api/routes/media.controller.ts` — endpoints `POST /media/ai-video`, `GET /media/ai-video/:jobId`.
- Modificar: registro DI (el módulo que provee `MediaController`/`MediaService`) para `VideoJobService`/`VideoJobRepository`.

**Orchestrator (mismo repo, `apps/orchestrator`):**
- Crear: `apps/orchestrator/src/activities/video.activity.ts`
- Crear: `apps/orchestrator/src/workflows/video-generation.workflow.ts`
- Modificar: `apps/orchestrator/src/workflows/index.ts` (export)
- Modificar: `apps/orchestrator/src/app.module.ts` (activity + `AiModule`)

**Frontend (`postiz-frontend`):**
- Crear: `apps/frontend/src/app/(app)/(site)/video-generator/page.tsx`
- Crear: `apps/frontend/src/components/video-generator/video-generator.component.tsx`
- Modificar: `apps/frontend/src/components/layout/top.menu.tsx` (entrada de nav, icono reusado)

---

## Task 1: Adapter — soportar todos los params de Veo y múltiples URLs

**Files:**
- Modify: `libraries/nestjs-libraries/src/ai/ai.interfaces.ts`
- Modify: `libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts`
- Test: `libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts`

- [ ] **Step 1: Cambiar el tipo de resultado y agregar `numberOfVideos`**

En `ai.interfaces.ts`, reemplazar la interface `VideoGenerationResult`:
```ts
export interface VideoGenerationResult {
  urls: string[];
}
```
Y en la interface `VideoOptions` agregar el campo (después de `seed?: number;`):
```ts
  numberOfVideos?: number;
```

- [ ] **Step 2: Reescribir el test (TDD)**

Reemplazar el contenido de `google-veo.adapter.test.ts` por:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateVideos = vi.fn();
const getVideosOperation = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateVideos },
    operations: { getVideosOperation },
  })),
}));

import { GoogleVeoAdapter } from '../adapters/video/google-veo.adapter';

const fakeUpload = {
  uploadSimple: vi.fn(async (b: any) => 'https://cdn.example.com/v.mp4'),
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })) as any;
});

describe('GoogleVeoAdapter', () => {
  it('texto: mapea config y devuelve urls', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }],
    }});
    const adapter = new GoogleVeoAdapter('key-123', 'veo-3.0-fast-generate-001', fakeUpload as any, 0);

    const result = await adapter.generateVideo('a cat', {
      aspectRatio: '16:9', durationSeconds: 8, seed: 42, numberOfVideos: 1, negativePrompt: 'blurry',
    });

    expect(generateVideos).toHaveBeenCalledWith(expect.objectContaining({
      model: 'veo-3.0-fast-generate-001',
      prompt: 'a cat',
      config: expect.objectContaining({
        aspectRatio: '16:9', durationSeconds: 8, seed: 42, numberOfVideos: 1, negativePrompt: 'blurry',
      }),
    }));
    expect(result).toEqual({ urls: ['https://cdn.example.com/v.mp4'] });
  });

  it('fotogramas: envia image y lastFrame, no referenceImages', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }],
    }});
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    await adapter.generateVideo('x', {
      aspectRatio: 'auto',
      startImage: { mimeType: 'image/png', base64: 'AAA' },
      endImage: { mimeType: 'image/png', base64: 'BBB' },
    });
    const call = generateVideos.mock.calls[0][0];
    expect(call.image).toEqual({ imageBytes: 'AAA', mimeType: 'image/png' });
    expect(call.config.lastFrame).toEqual({ imageBytes: 'BBB', mimeType: 'image/png' });
    expect(call.config.referenceImages).toBeUndefined();
  });

  it('ingredientes: envia referenceImages, no image/lastFrame', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }],
    }});
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    await adapter.generateVideo('x', {
      aspectRatio: '9:16',
      referenceImages: [{ mimeType: 'image/jpeg', base64: 'R1' }, { mimeType: 'image/jpeg', base64: 'R2' }],
    });
    const call = generateVideos.mock.calls[0][0];
    expect(call.image).toBeUndefined();
    expect(call.config.lastFrame).toBeUndefined();
    expect(call.config.referenceImages).toEqual([
      { image: { imageBytes: 'R1', mimeType: 'image/jpeg' }, referenceType: 'asset' },
      { image: { imageBytes: 'R2', mimeType: 'image/jpeg' }, referenceType: 'asset' },
    ]);
  });

  it('numberOfVideos>1: descarga y sube cada uno', async () => {
    generateVideos.mockResolvedValue({ done: true, response: {
      generatedVideos: [{ video: { uri: 'https://g/a.mp4' } }, { video: { uri: 'https://g/b.mp4' } }],
    }});
    fakeUpload.uploadSimple
      .mockResolvedValueOnce('https://cdn/1.mp4')
      .mockResolvedValueOnce('https://cdn/2.mp4');
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    const result = await adapter.generateVideo('x', { aspectRatio: '16:9', numberOfVideos: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ urls: ['https://cdn/1.mp4', 'https://cdn/2.mp4'] });
  });

  it('lanza si la operacion devuelve error', async () => {
    generateVideos.mockResolvedValue({ done: true, error: { message: 'quota exceeded' } });
    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);
    await expect(adapter.generateVideo('x', { aspectRatio: 'auto' })).rejects.toThrow('quota exceeded');
  });
});
```
Run, confirm FAIL: `pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts`

- [ ] **Step 3: Reescribir el adapter**

Reemplazar el contenido de `google-veo.adapter.ts` por:
```ts
import { GoogleGenAI } from '@google/genai';
import type { IUploadProvider } from '@gitroom/nestjs-libraries/upload/upload.interface';
import {
  VideoProvider,
  VideoOptions,
  VideoGenerationResult,
  ImageReference,
} from '../../ai.interfaces';
import { VEO_ASPECT_MAP } from '../../ai.types';

const MAX_POLL_ATTEMPTS = 60; // ~10 min a 10s por intento

function toImage(ref: ImageReference) {
  return { imageBytes: ref.base64, mimeType: ref.mimeType };
}

export class GoogleVeoAdapter implements VideoProvider {
  private ai: GoogleGenAI;

  constructor(
    private apiKey: string,
    private model: string,
    private upload: IUploadProvider,
    private pollIntervalMs = 10000
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateVideo(
    prompt: string,
    options: VideoOptions
  ): Promise<VideoGenerationResult> {
    const config: any = {
      aspectRatio: VEO_ASPECT_MAP[options.aspectRatio] ?? '16:9',
      numberOfVideos: options.numberOfVideos ?? 1,
    };
    if (options.durationSeconds) config.durationSeconds = options.durationSeconds;
    if (options.seed != null) config.seed = options.seed;
    if (options.negativePrompt) config.negativePrompt = options.negativePrompt;

    const params: any = { model: this.model, prompt, config };

    // referenceImages (ingredientes) es excluyente con image/lastFrame.
    if (options.referenceImages?.length) {
      config.referenceImages = options.referenceImages.map((r) => ({
        image: toImage(r),
        referenceType: 'asset',
      }));
    } else if (options.startImage) {
      params.image = toImage(options.startImage);
      if (options.endImage) config.lastFrame = toImage(options.endImage);
    }

    let operation: any = await this.ai.models.generateVideos(params);

    let attempts = 0;
    while (!operation.done) {
      if (attempts++ >= MAX_POLL_ATTEMPTS) {
        throw new Error('Veo video generation timed out');
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      operation = await this.ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new Error(operation.error.message || 'Veo video generation failed');
    }

    const videos = operation.response?.generatedVideos ?? [];
    if (!videos.length) {
      throw new Error('Veo returned no video URI');
    }

    const urls: string[] = [];
    for (const v of videos) {
      const uri = v?.video?.uri;
      if (!uri) continue;
      const resp = await fetch(`${uri}&key=${this.apiKey}`);
      if (!(resp as any).ok) {
        throw new Error('Failed to download generated video');
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      urls.push(await this.upload.uploadSimple(buffer));
    }

    if (!urls.length) throw new Error('Veo returned no video URI');
    return { urls };
  }
}
```

- [ ] **Step 4: Correr el test, confirmar PASS (5 tests)**

Run: `pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts`

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/ai.interfaces.ts libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts
git commit -m "feat(ai): support full Veo params (frames, references, multi-output) in adapter"
```

---

## Task 2: Validación de exclusividad modo↔params (helper puro)

**Files:**
- Create: `libraries/nestjs-libraries/src/ai/video/ai-video.helpers.ts`
- Test: `libraries/nestjs-libraries/src/ai/__tests__/ai-video.helpers.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `libraries/nestjs-libraries/src/ai/__tests__/ai-video.helpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateVideoModeParams } from '../video/ai-video.helpers';

const img = { mimeType: 'image/png', base64: 'AAA' };

describe('validateVideoModeParams', () => {
  it('text: requiere prompt', () => {
    expect(validateVideoModeParams({ mode: 'text', prompt: '' } as any)).toBe('prompt is required');
    expect(validateVideoModeParams({ mode: 'text', prompt: 'hi' } as any)).toBeNull();
  });

  it('frames: requiere startImage', () => {
    expect(validateVideoModeParams({ mode: 'frames' } as any)).toBe('startImage is required for frames mode');
    expect(validateVideoModeParams({ mode: 'frames', startImage: img } as any)).toBeNull();
  });

  it('ingredients: requiere prompt y al menos una referencia, max 3', () => {
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: 'x' } as any)).toBe('at least one reference image is required');
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: '', referenceImages: [img] } as any)).toBe('prompt is required');
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: 'x', referenceImages: [img, img, img, img] } as any)).toBe('max 3 reference images');
    expect(validateVideoModeParams({ mode: 'ingredients', prompt: 'x', referenceImages: [img] } as any)).toBeNull();
  });
});
```
Run, confirm FAIL.

- [ ] **Step 2: Implementar el helper**

Crear `libraries/nestjs-libraries/src/ai/video/ai-video.helpers.ts`:
```ts
import { ImageReference } from '../ai.interfaces';

export type VideoMode = 'text' | 'frames' | 'ingredients';

export interface AiVideoParams {
  mode: VideoMode;
  prompt?: string;
  startImage?: ImageReference;
  endImage?: ImageReference;
  referenceImages?: ImageReference[];
}

// Devuelve un mensaje de error si los params no son válidos para el modo, o null si OK.
export function validateVideoModeParams(p: AiVideoParams): string | null {
  if (p.mode === 'text') {
    if (!p.prompt) return 'prompt is required';
    return null;
  }
  if (p.mode === 'frames') {
    if (!p.startImage) return 'startImage is required for frames mode';
    return null;
  }
  if (p.mode === 'ingredients') {
    if (!p.prompt) return 'prompt is required';
    if (!p.referenceImages?.length) return 'at least one reference image is required';
    if (p.referenceImages.length > 3) return 'max 3 reference images';
    return null;
  }
  return 'unknown mode';
}
```

- [ ] **Step 3: Correr el test, confirmar PASS**

Run: `pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/ai-video.helpers.test.ts`

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/video/ai-video.helpers.ts libraries/nestjs-libraries/src/ai/__tests__/ai-video.helpers.test.ts
git commit -m "feat(ai): add video mode/params validation helper"
```

---

## Task 3: Prisma `VideoGenerationJob` + repositorio

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/schema.prisma`
- Create: `libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.repository.ts`

- [ ] **Step 1: Agregar el modelo + relación**

En `schema.prisma`, agregar el modelo (cerca de `Credits`):
```prisma
model VideoGenerationJob {
  id             String       @id @default(uuid())
  organizationId String
  userId         String
  status         String       @default("processing") // processing | done | error
  mode           String       // text | frames | ingredients
  params         Json
  resultMediaIds Json?
  creditIds      Json?        // ids de filas Credits a reembolsar si falla
  error          String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@map("video_generation_job")
}
```
En el modelo `Organization`, agregar la relación inversa (junto a las otras listas de relaciones):
```prisma
  videoGenerationJobs VideoGenerationJob[]
```

- [ ] **Step 2: Validar + generar**

Run:
```bash
pnpm dlx prisma@6.5.0 validate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma
pnpm run prisma-generate
```
Expected: valid + Generated Prisma Client.

- [ ] **Step 3: Crear el repositorio**

Crear `libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.repository.ts` (mirar `ai-config.repository.ts` para el patrón de `PrismaRepository`):
```ts
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoJobRepository {
  constructor(private _job: PrismaRepository<'videoGenerationJob'>) {}

  create(data: {
    organizationId: string;
    userId: string;
    mode: string;
    params: any;
    creditIds: string[];
  }) {
    return this._job.model.videoGenerationJob.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        mode: data.mode,
        params: data.params,
        creditIds: data.creditIds,
      },
    });
  }

  findById(id: string) {
    return this._job.model.videoGenerationJob.findUnique({ where: { id } });
  }

  markDone(id: string, resultMediaIds: string[]) {
    return this._job.model.videoGenerationJob.update({
      where: { id },
      data: { status: 'done', resultMediaIds },
    });
  }

  markError(id: string, error: string) {
    return this._job.model.videoGenerationJob.update({
      where: { id },
      data: { status: 'error', error },
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/schema.prisma libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.repository.ts
git commit -m "feat(video): add VideoGenerationJob model and repository"
```

---

## Task 4: Créditos N + servicio de jobs

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts`
- Create: `libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.service.ts`

- [ ] **Step 1: Métodos de créditos en el repositorio**

En `subscription.repository.ts`, dentro de la clase, agregar:
```ts
  async createCredits(orgId: string, type: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const row = await this._credits.model.credits.create({
        data: { organizationId: orgId, credits: 1, type },
      });
      ids.push(row.id);
    }
    return ids;
  }

  async deleteCredits(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this._credits.model.credits.deleteMany({ where: { id: { in: ids } } });
  }
```

- [ ] **Step 2: Wrappers en el servicio**

En `subscription.service.ts`, agregar:
```ts
  createCredits(orgId: string, type: string, count: number) {
    return this._subscriptionRepository.createCredits(orgId, type, count);
  }

  refundCredits(ids: string[]) {
    return this._subscriptionRepository.deleteCredits(ids);
  }
```
(Usa el mismo nombre de campo del repositorio que ya inyecta la clase; revisa cómo se llama — `_subscriptionRepository`.)

- [ ] **Step 3: Servicio de jobs**

Crear `libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { VideoJobRepository } from '@gitroom/nestjs-libraries/database/prisma/video-jobs/video-job.repository';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';

@Injectable()
export class VideoJobService {
  constructor(
    private _repo: VideoJobRepository,
    private _subscription: SubscriptionService
  ) {}

  create(orgId: string, userId: string, mode: string, params: any, creditIds: string[]) {
    return this._repo.create({ organizationId: orgId, userId, mode, params, creditIds });
  }

  getById(id: string) {
    return this._repo.findById(id);
  }

  markDone(id: string, resultMediaIds: string[]) {
    return this._repo.markDone(id, resultMediaIds);
  }

  async fail(id: string, error: string, creditIds: string[]) {
    await this._subscription.refundCredits(creditIds);
    return this._repo.markError(id, error);
  }
}
```

- [ ] **Step 4: Registrar en DI**

Encontrar el módulo que provee los servicios prisma (probablemente `database.module.ts` o el módulo de `MediaController`). Agregar `VideoJobRepository` y `VideoJobService` a `providers` y `exports`. Verificación: el build de Task 6 fallará si falta. Comando para localizar: `grep -rln "AiConfigRepository" --include=*.ts libraries apps | grep -i module`.

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts libraries/nestjs-libraries/src/database/prisma/video-jobs/video-job.service.ts
git commit -m "feat(video): add multi-credit helpers and video job service"
```

---

## Task 5: DTO + endpoints backend

**Files:**
- Create: `libraries/nestjs-libraries/src/dtos/videos/ai-video.dto.ts`
- Modify: `apps/backend/src/api/routes/media.controller.ts`

- [ ] **Step 1: DTO con class-validator**

Crear `libraries/nestjs-libraries/src/dtos/videos/ai-video.dto.ts`:
```ts
import {
  IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ImageRefDto {
  @IsString() mimeType: string;
  @IsString() base64: string;
}

export class AiVideoDto {
  @IsIn(['text', 'frames', 'ingredients'])
  mode: 'text' | 'frames' | 'ingredients';

  @IsOptional() @IsString()
  prompt?: string;

  @IsIn(['16:9', '9:16', 'auto'])
  aspectRatio: '16:9' | '9:16' | 'auto';

  @IsOptional() @IsInt() @Min(1) @Max(8)
  durationSeconds?: number;

  @IsOptional() @IsInt()
  seed?: number;

  @IsInt() @Min(1) @Max(4)
  numberOfVideos: number;

  @IsOptional() @ValidateNested() @Type(() => ImageRefDto)
  startImage?: ImageRefDto;

  @IsOptional() @ValidateNested() @Type(() => ImageRefDto)
  endImage?: ImageRefDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ImageRefDto)
  referenceImages?: ImageRefDto[];

  @IsOptional() @IsString()
  negativePrompt?: string;
}
```

- [ ] **Step 2: Endpoints en el controller**

En `media.controller.ts`:
1. Imports nuevos:
```ts
import { AiVideoDto } from '@gitroom/nestjs-libraries/dtos/videos/ai-video.dto';
import { VideoJobService } from '@gitroom/nestjs-libraries/database/prisma/video-jobs/video-job.service';
import { TemporalService } from 'nestjs-temporal-core';
import { validateVideoModeParams } from '@gitroom/nestjs-libraries/ai/video/ai-video.helpers';
import { HttpException, HttpStatus } from '@nestjs/common';
```
2. Inyectar en el constructor: `private _videoJobService: VideoJobService`, `private _temporalService: TemporalService`.
3. Agregar los métodos (después de `generateVideo`):
```ts
  @Post('/ai-video')
  async aiVideo(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: AiVideoDto
  ) {
    const validationError = validateVideoModeParams(body as any);
    if (validationError) {
      throw new HttpException(validationError, HttpStatus.BAD_REQUEST);
    }

    const credits = await this._subscriptionService.checkCredits(org, 'ai_videos');
    if (process.env.STRIPE_PUBLISHABLE_KEY && credits.credits < body.numberOfVideos) {
      throw new HttpException('Not enough video credits', HttpStatus.PAYMENT_REQUIRED);
    }

    const creditIds = await this._subscriptionService.createCredits(
      org.id, 'ai_videos', body.numberOfVideos
    );

    const job = await this._videoJobService.create(org.id, user.id, body.mode, body, creditIds);

    try {
      await this._temporalService.client.getRawClient()?.workflow.start(
        'videoGenerationWorkflow',
        {
          workflowId: `video_${job.id}`,
          taskQueue: 'main',
          args: [{ jobId: job.id, userId: user.id, orgId: org.id }],
        }
      );
    } catch (err: any) {
      await this._videoJobService.fail(job.id, 'Failed to start generation', creditIds);
      throw new HttpException('Failed to start generation', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { jobId: job.id };
  }

  @Get('/ai-video/:jobId')
  async aiVideoStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('jobId') jobId: string
  ) {
    const job = await this._videoJobService.getById(jobId);
    if (!job || job.organizationId !== org.id) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    const ids = (job.resultMediaIds as string[]) || [];
    const media = await Promise.all(ids.map((id) => this._mediaService.getMediaById(id)));
    return {
      status: job.status,
      error: job.error,
      media: media.filter(Boolean).map((m: any) => ({ id: m.id, path: m.path })),
    };
  }
```

- [ ] **Step 3: Build backend (gate)**

Run: `pnpm build:backend`
Expected: éxito. Si `TemporalService` no se resuelve en el módulo del controller, verifica que el módulo importe el TemporalModule (el backend ya lo registra globalmente vía `getTemporalModule(false)` en `app.module.ts`).

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/dtos/videos/ai-video.dto.ts apps/backend/src/api/routes/media.controller.ts
git commit -m "feat(media): add async ai-video generate + status endpoints"
```

---

## Task 6: Temporal workflow + activity (orchestrator)

**Files:**
- Create: `apps/orchestrator/src/activities/video.activity.ts`
- Create: `apps/orchestrator/src/workflows/video-generation.workflow.ts`
- Modify: `apps/orchestrator/src/workflows/index.ts`
- Modify: `apps/orchestrator/src/app.module.ts`

- [ ] **Step 1: La activity**

Crear `apps/orchestrator/src/activities/video.activity.ts` (mirar `post.activity.ts` para el patrón `@Activity`/`@ActivityMethod`):
```ts
import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AiProviderResolver } from '@gitroom/nestjs-libraries/ai/ai.provider-resolver';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { VideoJobService } from '@gitroom/nestjs-libraries/database/prisma/video-jobs/video-job.service';

@Injectable()
@Activity()
export class VideoActivity {
  constructor(
    private _resolver: AiProviderResolver,
    private _mediaService: MediaService,
    private _videoJobService: VideoJobService
  ) {}

  @ActivityMethod()
  async generateVideoJob(input: { jobId: string; userId: string; orgId: string }) {
    const job = await this._videoJobService.getById(input.jobId);
    if (!job) return;
    const params: any = job.params;
    const creditIds = (job.creditIds as string[]) || [];

    try {
      const provider = await this._resolver.getVideoProvider(input.userId);
      if (!provider) {
        await this._videoJobService.fail(input.jobId, 'No video provider configured', creditIds);
        return;
      }

      const { urls } = await provider.generateVideo(params.prompt || '', {
        aspectRatio: params.aspectRatio,
        durationSeconds: params.durationSeconds,
        seed: params.seed,
        numberOfVideos: params.numberOfVideos,
        negativePrompt: params.negativePrompt,
        startImage: params.startImage,
        endImage: params.endImage,
        referenceImages: params.referenceImages,
      });

      const mediaIds: string[] = [];
      for (const url of urls) {
        const saved = await this._mediaService.saveFile(
          input.orgId,
          url.split('/').pop()!,
          url
        );
        mediaIds.push(saved.id);
      }

      await this._videoJobService.markDone(input.jobId, mediaIds);
    } catch (err: any) {
      await this._videoJobService.fail(
        input.jobId,
        err?.message || 'Video generation failed',
        creditIds
      );
    }
  }
}
```
> Nota: `saveFile` es público en `MediaService` (lo usa `generateVideo`). Si fuera privado, expón un método público equivalente en `MediaService` que llame al repositorio `saveFile`.

- [ ] **Step 2: El workflow**

Crear `apps/orchestrator/src/workflows/video-generation.workflow.ts`:
```ts
import { proxyActivities } from '@temporalio/workflow';
import { VideoActivity } from '@gitroom/orchestrator/activities/video.activity';

const { generateVideoJob } = proxyActivities<VideoActivity>({
  startToCloseTimeout: '15 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

export async function videoGenerationWorkflow(input: {
  jobId: string;
  userId: string;
  orgId: string;
}) {
  await generateVideoJob(input);
}
```

- [ ] **Step 3: Exportar el workflow**

En `apps/orchestrator/src/workflows/index.ts`, agregar:
```ts
export * from './video-generation.workflow';
```

- [ ] **Step 4: Registrar activity + AiModule en el módulo**

En `apps/orchestrator/src/app.module.ts`:
1. Imports:
```ts
import { VideoActivity } from '@gitroom/orchestrator/activities/video.activity';
import { AiModule } from '@gitroom/nestjs-libraries/ai/ai.module';
```
2. Agregar `VideoActivity` al array `activities`.
3. Agregar `AiModule` al array `imports` del `@Module` (antes de `getTemporalModule(...)`).

- [ ] **Step 5: Build orchestrator (gate)**

Run: `pnpm build:orchestrator`
Expected: éxito. Si `MediaService`/`VideoJobService` no resuelven, asegúrate de que `DatabaseModule` (ya importado en orchestrator) los exporte (los agregaste en Task 4 Step 4).

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/src/activities/video.activity.ts apps/orchestrator/src/workflows/video-generation.workflow.ts apps/orchestrator/src/workflows/index.ts apps/orchestrator/src/app.module.ts
git commit -m "feat(orchestrator): add Temporal workflow/activity for video generation"
```

---

## Task 7: Frontend — página + panel + polling + nav

**Files (repo `postiz-frontend`):**
- Create: `apps/frontend/src/components/video-generator/video-generator.component.tsx`
- Create: `apps/frontend/src/app/(app)/(site)/video-generator/page.tsx`
- Modify: `apps/frontend/src/components/layout/top.menu.tsx`

> Trabajar en `postiz-frontend`, branch `feat/video-generator-fase-b`.

- [ ] **Step 1: El componente del panel**

Crear `apps/frontend/src/components/video-generator/video-generator.component.tsx`:
```tsx
'use client';

import React, { useCallback, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Mode = 'text' | 'frames' | 'ingredients';
interface ImageRef { mimeType: string; base64: string }
interface ResultMedia { id: string; path: string }

function readFileAsBase64(file: File): Promise<ImageRef> {
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

export const VideoGeneratorComponent: React.FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();

  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | 'auto'>('16:9');
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [seed, setSeed] = useState<string>('');
  const [numberOfVideos, setNumberOfVideos] = useState(1);
  const [startImage, setStartImage] = useState<ImageRef | null>(null);
  const [endImage, setEndImage] = useState<ImageRef | null>(null);
  const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<ResultMedia[]>([]);
  const pollRef = useRef<any>(null);

  const pickStart = useCallback(async (f?: File) => {
    if (f) setStartImage(await readFileAsBase64(f));
  }, []);
  const pickEnd = useCallback(async (f?: File) => {
    if (f) setEndImage(await readFileAsBase64(f));
  }, []);
  const pickRefs = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const refs = await Promise.all(Array.from(files).slice(0, 3).map(readFileAsBase64));
    setReferenceImages(refs);
  }, []);

  const poll = useCallback((jobId: string) => {
    pollRef.current = setInterval(async () => {
      const res = await (await fetch(`/media/ai-video/${jobId}`)).json();
      if (res.status === 'done') {
        clearInterval(pollRef.current);
        setResults(res.media || []);
        setGenerating(false);
        toaster.show(t('video_done', 'Video ready!'), 'success');
      } else if (res.status === 'error') {
        clearInterval(pollRef.current);
        setGenerating(false);
        toaster.show(res.error || t('video_failed', 'Generation failed'), 'warning');
      }
    }, 5000);
  }, [fetch, toaster, t]);

  const generate = useCallback(async () => {
    const body: any = { mode, aspectRatio, numberOfVideos, durationSeconds };
    if (prompt) body.prompt = prompt;
    if (seed) body.seed = parseInt(seed, 10);
    if (mode === 'frames') {
      body.startImage = startImage;
      if (endImage) body.endImage = endImage;
    }
    if (mode === 'ingredients') body.referenceImages = referenceImages;

    setGenerating(true);
    setResults([]);
    try {
      const res = await fetch('/media/ai-video', { method: 'POST', body: JSON.stringify(body) });
      if (res.status !== 200 && res.status !== 201) {
        const msg = await res.text();
        toaster.show(msg || t('video_failed', 'Generation failed'), 'warning');
        setGenerating(false);
        return;
      }
      const { jobId } = await res.json();
      poll(jobId);
    } catch {
      setGenerating(false);
      toaster.show(t('video_failed', 'Generation failed'), 'warning');
    }
  }, [mode, aspectRatio, numberOfVideos, durationSeconds, prompt, seed, startImage, endImage, referenceImages, fetch, poll, toaster, t]);

  const tabBtn = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`px-[16px] h-[36px] rounded-[8px] text-[14px] ${mode === m ? 'bg-forth text-white' : 'bg-newBgColorInner'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-[16px] max-w-[560px]">
      <div className="text-[20px] font-medium">{t('ai_video_generator', 'AI Video Generator')}</div>

      <div className="flex gap-[8px]">
        {tabBtn('text', t('text_to_video', 'Text to Video'))}
        {tabBtn('frames', t('frames_to_video', 'Frames to Video'))}
        {tabBtn('ingredients', t('ingredients_to_video', 'Ingredients'))}
      </div>

      {mode === 'frames' && (
        <div className="flex flex-col gap-[8px]">
          <div className="text-[14px]">{t('start_frame', 'Start frame')}</div>
          <input type="file" accept="image/*" onChange={(e) => pickStart(e.target.files?.[0])} />
          <div className="text-[14px]">{t('end_frame', 'End frame (optional)')}</div>
          <input type="file" accept="image/*" onChange={(e) => pickEnd(e.target.files?.[0])} />
        </div>
      )}

      {mode === 'ingredients' && (
        <div className="flex flex-col gap-[8px]">
          <div className="text-[14px]">{t('reference_images', 'Reference images (max 3)')}</div>
          <input type="file" accept="image/*" multiple onChange={(e) => pickRefs(e.target.files)} />
        </div>
      )}

      <div className="flex flex-col gap-[6px]">
        <div className="text-[14px]">{t('prompt', 'Prompt')}</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[100px] bg-newBgColorInner p-[12px] outline-none border-newTableBorder border rounded-[8px] text-[14px]"
        />
      </div>

      <div className="flex gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">{t('aspect_ratio', 'Aspect ratio')}</div>
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)}
            className="h-[42px] bg-newBgColorInner px-[12px] border-newTableBorder border rounded-[8px] text-[14px]">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="auto">Auto</option>
          </select>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">{t('duration', 'Duration (s)')}</div>
          <select value={durationSeconds} onChange={(e) => setDurationSeconds(parseInt(e.target.value, 10))}
            className="h-[42px] bg-newBgColorInner px-[12px] border-newTableBorder border rounded-[8px] text-[14px]">
            <option value={4}>4</option>
            <option value={6}>6</option>
            <option value={8}>8</option>
          </select>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">{t('num_videos', '# Videos')}</div>
          <select value={numberOfVideos} onChange={(e) => setNumberOfVideos(parseInt(e.target.value, 10))}
            className="h-[42px] bg-newBgColorInner px-[12px] border-newTableBorder border rounded-[8px] text-[14px]">
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">{t('seed', 'Seed')}</div>
          <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="auto"
            className="h-[42px] w-[100px] bg-newBgColorInner px-[12px] border-newTableBorder border rounded-[8px] text-[14px]" />
        </div>
      </div>

      <div className="text-[12px] text-customColor18">
        {t('credits_required', 'Credits required')}: {numberOfVideos}
      </div>

      <Button className="rounded-[8px]" loading={generating} onClick={generate}>
        {t('generate_video', 'Generate Video')}
      </Button>

      {results.length > 0 && (
        <div className="flex flex-wrap gap-[12px]">
          {results.map((r) => (
            <video key={r.id} src={r.path} controls className="w-[240px] rounded-[8px]" />
          ))}
        </div>
      )}
    </div>
  );
};

export default VideoGeneratorComponent;
```

- [ ] **Step 2: La página**

Mirar una ruta vecina (p.ej. `apps/frontend/src/app/(app)/(site)/media/page.tsx`) para el patrón exacto de `page.tsx` (metadata, layout). Crear `apps/frontend/src/app/(app)/(site)/video-generator/page.tsx` siguiendo ese patrón, renderizando el componente:
```tsx
import VideoGeneratorComponent from '@gitroom/frontend/components/video-generator/video-generator.component';

export default function Page() {
  return <VideoGeneratorComponent />;
}
```
(Si la ruta vecina exporta `metadata` o usa un wrapper de layout, replícalo.)

- [ ] **Step 3: Entrada en el menú de navegación**

En `apps/frontend/src/components/layout/top.menu.tsx`, agregar un item al array de menú apropiado (junto a `media`). REUSAR el icono de un item existente (copia el JSX `<svg>...</svg>` del item `media`) — NO crear un SVG nuevo. Ejemplo de item:
```tsx
    {
      name: t('video_generator', 'Video Generator'),
      icon: ( /* PEGAR AQUÍ el mismo <svg> del item 'media' */ ),
      path: '/video-generator',
    },
```

- [ ] **Step 4: Typecheck del frontend (gate)**

Run: `pnpm exec tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: sin errores. (Si el tsconfig difiere, localiza el del frontend.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/video-generator/video-generator.component.tsx "apps/frontend/src/app/(app)/(site)/video-generator/page.tsx" apps/frontend/src/components/layout/top.menu.tsx
git commit -m "feat(video): add AI Video Generator page, panel and nav entry"
```

---

## Task 8: Verificación final + smoke

**Files:** ninguno.

- [ ] **Step 1: Tests backend**

Run (en `postiz-backend`):
```bash
pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts libraries/nestjs-libraries/src/ai/__tests__/ai-video.helpers.test.ts libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts
```
Expected: todos PASS.

- [ ] **Step 2: Builds**

Run:
```bash
pnpm build:backend
pnpm build:orchestrator
```
Expected: ambos éxito.

- [ ] **Step 3: Smoke manual**

1. `pnpm run prisma-db-push` (crea tabla `video_generation_job`). Levantar backend + orchestrator + frontend (+ Temporal corriendo).
2. Configurar Google Veo en Settings → AI provider (key Google con acceso a Veo) y créditos disponibles (tier no-FREE o sin Stripe).
3. Ir a la nueva sección **Video Generator**.
4. Modo Texto: prompt + 16:9 + 8s + 1 video → Generar → el job pasa a `done` y aparece el video; queda en la media library.
5. Modo Fotogramas: subir imagen inicial (+ final opcional) → Generar.
6. Modo Ingredientes: prompt + 1-3 referencias → Generar.
7. Verificar refund: con una key inválida, el job pasa a `error` y los créditos se reembolsan (no se descuentan netos).

Expected: los tres modos generan; errores marcan `error` + reembolsan; videos en media library.

- [ ] **Step 4: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "test(video): verify Fase B end-to-end"
```

---

## Self-Review (cobertura del spec)

- **Adapter: image/lastFrame/referenceImages/duration/seed/numberOfVideos/aspect/negative + multi-URL** → Task 1.
- **Exclusividad modo↔params** → Task 2 (+ usado en Task 5).
- **Modelo `VideoGenerationJob` + repo** → Task 3.
- **Créditos N + refund + servicio de jobs** → Task 4.
- **DTO + `POST /media/ai-video` (checkCredits, deduce N, arranca workflow) + `GET /media/ai-video/:jobId`** → Task 5.
- **Workflow + activity (getVideoProvider → saveFile → markDone; error → fail+refund) + AiModule en orchestrator** → Task 6.
- **Página dedicada + panel (3 modos, aspect/duración/seed/nº) + polling + nav (icono reusado, sin SVG nuevo)** → Task 7.
- **Async durable** → Temporal (Task 6). **Gating créditos** → Task 5 (solo bloquea con Stripe, comportamiento del fork).
- **Fuera de alcance** (nodos, encadenado de clips, ✨ enhance, visibilidad) → sin tasks.
