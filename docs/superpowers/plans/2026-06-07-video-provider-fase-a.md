# Fase A — Proveedor de video (Google Veo) en AI Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir configurar un modelo de video de Google (Veo) en la sección de proveedores de IA y exponer un `VideoProvider` reutilizable para Fases B/C.

**Architecture:** Se extiende el subsistema multi-AI existente (`UserAiConfig` + `AiProviderResolver` + adapters por proveedor + UI `ai-provider.component.tsx`). Video reusa la key de Google ya guardada (`gemini`). Se agrega un `GoogleVeoAdapter` (SDK `@google/genai`, `generateVideos` + polling) que sube el resultado vía la upload factory existente y devuelve `{ url }`.

**Tech Stack:** NestJS + Prisma (`postiz-backend`), Next.js/React (`postiz-frontend`), `@google/genai`, vitest (tests), pnpm monorepo.

**Spec:** `docs/superpowers/specs/2026-06-07-video-provider-fase-a-design.md`

---

## Notas de entorno (leer antes de empezar)

- **Dos repos git separados** (forks split):
  - Backend: `/Users/yairchan/Proyectos/Social Media/postiz-backend`
  - Frontend: `/Users/yairchan/Proyectos/Social Media/postiz-frontend`
  - Cada commit va en su repo. Las rutas de comandos asumen estar dentro del repo correspondiente.
- **Tests:** el repo NO tiene jest configurado (el spec `ai.encryption.spec.ts` no corre). Usar **vitest**, que ya está instalado y corre TS zero-config. Los tests nuevos **deben** importar `{ describe, it, expect, vi }` desde `'vitest'` (no hay globals).
  - Correr un test: `pnpm exec vitest run <ruta-al-test>`
- **Gate de typecheck (backend):** `pnpm build:backend` (compila con nest; falla si hay errores de tipos). Es la verificación principal para archivos que usan alias `@gitroom/*` (resolver, service, controller), porque vitest zero-config no resuelve esos alias en runtime.
- **Regla de tests con alias:** evitar importar `@gitroom/*` como valor en archivos bajo test de vitest. Para tipos usar `import type { ... } from '@gitroom/...'` (esbuild lo borra). El adapter recibe sus dependencias por constructor para quedar libre de alias y testeable.
- **Prisma:** validar con `pnpm dlx prisma@6.5.0 validate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma` y generar con `pnpm run prisma-generate`.

---

## Estructura de archivos

**Backend (`postiz-backend`):**
- Modificar: `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (modelo `UserAiConfig`)
- Modificar: `libraries/nestjs-libraries/src/ai/ai.types.ts` (constantes de video)
- Modificar: `libraries/nestjs-libraries/src/ai/ai.interfaces.ts` (`VideoOptions`, `VideoProvider`)
- Crear: `libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts`
- Crear: `libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts`
- Crear: `libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts`
- Modificar: `libraries/nestjs-libraries/src/ai/ai.provider-resolver.ts` (`getVideoProvider` + caché)
- Modificar: `libraries/nestjs-libraries/src/database/prisma/ai-config/ai-config.service.ts` (DTO/response/persistencia)
- Modificar: `libraries/nestjs-libraries/src/database/prisma/ai-config/ai-config.repository.ts` (`upsert`)
- Modificar: `apps/backend/src/api/routes/ai-config.controller.ts` (validación PUT)
- Modificar: `package.json` (dependencia `@google/genai`, vía `pnpm add`)

**Frontend (`postiz-frontend`):**
- Modificar: `apps/frontend/src/components/settings/ai-provider.component.tsx` (sección Video + estado + payload)

---

## Task 0: Agregar dependencia `@google/genai`

**Files:**
- Modify: `postiz-backend/package.json` (vía pnpm)

- [ ] **Step 1: Instalar el SDK en el workspace backend**

Run (desde `postiz-backend`):
```bash
pnpm add @google/genai
```
Expected: `@google/genai` aparece en `dependencies` de `package.json`.

- [ ] **Step 2: Verificar que resuelve**

Run:
```bash
node -e "console.log(require('@google/genai/package.json').version)"
```
Expected: imprime una versión (p.ej. `1.x.x`) sin error.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @google/genai for Veo video generation"
```

---

## Task 1: Schema Prisma — campos de video en `UserAiConfig`

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/schema.prisma:993-1006`

- [ ] **Step 1: Agregar los campos al modelo**

En el modelo `UserAiConfig`, después de la línea `imageModel    String?`, agregar dos campos:

```prisma
model UserAiConfig {
  id            String   @id @default(uuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  textProvider  String
  imageProvider String?
  textModel     String?
  imageModel    String?
  videoProvider String?
  videoModel    String?
  encryptedKeys Json
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@map("user_ai_config")
}
```

- [ ] **Step 2: Validar el schema**

Run:
```bash
pnpm dlx prisma@6.5.0 validate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma
```
Expected: `The schema at ... is valid 🚀`

- [ ] **Step 3: Regenerar el cliente Prisma**

Run:
```bash
pnpm run prisma-generate
```
Expected: `Generated Prisma Client` sin errores. (El push a la BD con `pnpm run prisma-db-push` se hace en el deploy, no aquí.)

- [ ] **Step 4: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/schema.prisma
git commit -m "feat(ai): add video provider/model fields to UserAiConfig"
```

---

## Task 2: Constantes de video en `ai.types.ts`

**Files:**
- Modify: `libraries/nestjs-libraries/src/ai/ai.types.ts`
- Test: `libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  VIDEO_PROVIDERS,
  DEFAULT_VIDEO_MODELS,
  VEO_ASPECT_MAP,
} from '../ai.types';

describe('video types', () => {
  it('lists google as a video provider', () => {
    expect(VIDEO_PROVIDERS).toContain('google');
  });

  it('has a default model for google', () => {
    expect(DEFAULT_VIDEO_MODELS.google).toBe('veo-3.0-fast-generate-001');
  });

  it('maps aspect ratios to Veo-supported values', () => {
    expect(VEO_ASPECT_MAP['16:9']).toBe('16:9');
    expect(VEO_ASPECT_MAP['9:16']).toBe('9:16');
    expect(VEO_ASPECT_MAP['auto']).toBe('16:9');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts
```
Expected: FAIL — `VIDEO_PROVIDERS`/`DEFAULT_VIDEO_MODELS`/`VEO_ASPECT_MAP` no existen.

- [ ] **Step 3: Implementar las constantes**

En `libraries/nestjs-libraries/src/ai/ai.types.ts`, después de la definición de `IMAGE_PROVIDERS` / `ImageProviderType`, agregar:

```ts
export const VIDEO_PROVIDERS = ['google'] as const;
export type VideoProviderType = (typeof VIDEO_PROVIDERS)[number];
```

Y al final del archivo (junto a los demás defaults/maps):

```ts
// Default video models per provider (Veo via Gemini API).
// Confirmar el id contra https://ai.google.dev/gemini-api/docs/video si Google publica uno nuevo.
export const DEFAULT_VIDEO_MODELS: Record<VideoProviderType, string> = {
  google: 'veo-3.0-fast-generate-001',
};

// Veo aspect ratio mapping. Veo soporta 16:9 y 9:16; 'auto' cae a 16:9.
export const VEO_ASPECT_MAP: Record<string, string> = {
  '16:9': '16:9',
  '9:16': '9:16',
  auto: '16:9',
};
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/ai.types.ts libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts
git commit -m "feat(ai): add video provider constants and Veo aspect map"
```

---

## Task 3: Interfaz `VideoProvider` y `VideoOptions`

**Files:**
- Modify: `libraries/nestjs-libraries/src/ai/ai.interfaces.ts`

(Solo tipos: se verifica con el build de Task 9. No lleva test de runtime.)

- [ ] **Step 1: Agregar las interfaces**

En `libraries/nestjs-libraries/src/ai/ai.interfaces.ts`, al final del archivo (después de `ImageProvider`):

```ts
export type VideoAspectRatio = '16:9' | '9:16' | 'auto';

export interface VideoOptions {
  aspectRatio: VideoAspectRatio;
  // Las opciones de abajo las consumen las Fases B/C; el adapter de Fase A
  // implementa solo prompt + aspectRatio. Se declaran aquí para fijar el contrato.
  durationSeconds?: number;
  seed?: number;
  startImage?: ImageReference;
  endImage?: ImageReference;
  referenceImages?: ImageReference[];
  negativePrompt?: string;
}

export interface VideoGenerationResult {
  url: string;
}

export interface VideoProvider {
  generateVideo(
    prompt: string,
    options: VideoOptions
  ): Promise<VideoGenerationResult>;
}
```

- [ ] **Step 2: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/ai.interfaces.ts
git commit -m "feat(ai): add VideoProvider and VideoOptions interfaces"
```

---

## Task 4: `GoogleVeoAdapter`

**Files:**
- Create: `libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts`
- Test: `libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts`

El adapter recibe `apiKey`, `model`, un `IUploadProvider` y un `pollIntervalMs` opcional (para tests). No importa ningún alias `@gitroom/*` como valor (solo `import type`), por lo que corre en vitest.

- [ ] **Step 1: Escribir el test que falla**

Crear `libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del SDK de Google antes de importar el adapter.
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
  uploadSimple: vi.fn(async () => 'https://cdn.example.com/video.mp4'),
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // fetch del archivo de video → bytes
  global.fetch = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })) as any;
});

describe('GoogleVeoAdapter', () => {
  it('genera, hace polling y devuelve la URL subida', async () => {
    generateVideos.mockResolvedValue({ done: false, name: 'op/1' });
    getVideosOperation.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [{ video: { uri: 'https://g/v.mp4' } }],
      },
    });

    const adapter = new GoogleVeoAdapter(
      'key-123',
      'veo-3.0-fast-generate-001',
      fakeUpload as any,
      0 // pollIntervalMs = 0 en test
    );

    const result = await adapter.generateVideo('a cat', {
      aspectRatio: '16:9',
    });

    expect(generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'veo-3.0-fast-generate-001',
        prompt: 'a cat',
        config: expect.objectContaining({ aspectRatio: '16:9', numberOfVideos: 1 }),
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://g/v.mp4&key=key-123'
    );
    expect(fakeUpload.uploadSimple).toHaveBeenCalled();
    expect(result).toEqual({ url: 'https://cdn.example.com/video.mp4' });
  });

  it('lanza si la operación devuelve error', async () => {
    generateVideos.mockResolvedValue({
      done: true,
      error: { message: 'quota exceeded' },
    });

    const adapter = new GoogleVeoAdapter('k', 'm', fakeUpload as any, 0);

    await expect(
      adapter.generateVideo('x', { aspectRatio: 'auto' })
    ).rejects.toThrow('quota exceeded');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts
```
Expected: FAIL — `Cannot find module '../adapters/video/google-veo.adapter'`.

- [ ] **Step 3: Implementar el adapter**

Crear `libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts`:

```ts
import { GoogleGenAI } from '@google/genai';
import type { IUploadProvider } from '@gitroom/nestjs-libraries/upload/upload.interface';
import {
  VideoProvider,
  VideoOptions,
  VideoGenerationResult,
} from '../../ai.interfaces';
import { VEO_ASPECT_MAP } from '../../ai.types';

const MAX_POLL_ATTEMPTS = 60; // ~10 min a 10s por intento

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
    const aspectRatio = VEO_ASPECT_MAP[options.aspectRatio] ?? '16:9';

    let operation: any = await this.ai.models.generateVideos({
      model: this.model,
      prompt,
      config: {
        aspectRatio,
        numberOfVideos: 1,
      },
    });

    let attempts = 0;
    while (!operation.done) {
      if (attempts++ >= MAX_POLL_ATTEMPTS) {
        throw new Error('Veo video generation timed out');
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      operation = await this.ai.operations.getVideosOperation({ operation });
    }

    if (operation.error) {
      throw new Error(
        operation.error.message || 'Veo video generation failed'
      );
    }

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      throw new Error('Veo returned no video URI');
    }

    // El archivo de Veo requiere la API key como query param.
    const resp = await fetch(`${uri}&key=${this.apiKey}`);
    if (!(resp as any).ok) {
      throw new Error('Failed to download generated video');
    }
    const buffer = Buffer.from(await resp.arrayBuffer());

    const url = await this.upload.uploadSimple(buffer);
    return { url };
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/adapters/video/google-veo.adapter.ts libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts
git commit -m "feat(ai): add Google Veo video adapter with mocked-tested polling"
```

---

## Task 5: `getVideoProvider` en el resolver

**Files:**
- Modify: `libraries/nestjs-libraries/src/ai/ai.provider-resolver.ts`

(Usa alias `@gitroom/*`; se verifica con el build de Task 9, no con vitest.)

- [ ] **Step 1: Importar tipos y adapter + upload factory**

En `ai.provider-resolver.ts`, en el bloque de imports superior, agregar:

```ts
import { VideoProvider } from './ai.interfaces';
import { DEFAULT_VIDEO_MODELS } from './ai.types';
import { GoogleVeoAdapter } from './adapters/video/google-veo.adapter';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
```

Y agregar `ImageProvider` ya está; añadir `VideoProvider` a la línea existente de import desde `'./ai.interfaces'` si prefieres una sola línea. Ambas formas compilan.

- [ ] **Step 2: Agregar el caché de video**

Junto a `private imageCache = new LRUCache<string, ImageProvider>(CACHE_OPTIONS);` agregar:

```ts
  private videoCache = new LRUCache<string, VideoProvider>(CACHE_OPTIONS);
```

- [ ] **Step 3: Agregar el método `getVideoProvider`**

Después del método `getImageProvider`, agregar:

```ts
  async getVideoProvider(userId: string): Promise<VideoProvider | null> {
    const cached = this.videoCache.get(userId);
    if (cached) return cached;
    const data = await this.configService.getDecryptedKeys(userId);
    if (!data || !data.config.videoProvider) return null;
    const { config, keys } = data;
    // Video reusa la key de Google (almacenada como 'gemini').
    const apiKey = keys['gemini'];
    if (!apiKey) return null;
    const model = config.videoModel ?? DEFAULT_VIDEO_MODELS['google'];
    const adapter = new GoogleVeoAdapter(
      apiKey,
      model,
      UploadFactory.createStorage()
    );
    this.videoCache.set(userId, adapter);
    return adapter;
  }
```

> Nota: `config.videoProvider` y `config.videoModel` vienen del service en Task 6. Si haces este task antes que el 6, el typecheck del build (Task 9) marcará el campo faltante — implementa Task 6 antes de correr el build.

- [ ] **Step 4: Invalidar el caché de video**

En `invalidateCache(userId)`, agregar:

```ts
    this.videoCache.delete(userId);
```

- [ ] **Step 5: Commit**

```bash
git add libraries/nestjs-libraries/src/ai/ai.provider-resolver.ts
git commit -m "feat(ai): resolve per-user Google Veo video provider"
```

---

## Task 6: Persistencia en `AiConfigService` y repositorio

**Files:**
- Modify: `libraries/nestjs-libraries/src/database/prisma/ai-config/ai-config.service.ts`
- Modify: `libraries/nestjs-libraries/src/database/prisma/ai-config/ai-config.repository.ts`

- [ ] **Step 1: Extender las interfaces y el import de tipos en el service**

En `ai-config.service.ts`, en el import de `ai.types`, agregar `VideoProviderType`:

```ts
import {
  EncryptedKeysSchema,
  TextProviderType,
  ImageProviderType,
  VideoProviderType,
} from '@gitroom/nestjs-libraries/ai/ai.types';
```

En `UserAiConfigDto`, agregar:

```ts
  videoProvider?: VideoProviderType | null;
  videoModel?: string | null;
```

En `UserAiConfigResponse`, agregar:

```ts
  videoProvider?: VideoProviderType | null;
  videoModel?: string | null;
```

- [ ] **Step 2: Devolver los campos en `getConfig`**

En el `return` de `getConfig`, agregar después de `imageModel: config.imageModel,`:

```ts
      videoProvider: config.videoProvider as VideoProviderType | null,
      videoModel: config.videoModel,
```

- [ ] **Step 3: Incluir los campos en `decryptRow`**

En la firma del parámetro `row` de `decryptRow`, agregar:

```ts
    videoProvider: string | null;
    videoModel: string | null;
```

Y en el objeto `config` que retorna `decryptRow`, agregar después de `imageModel: row.imageModel,`:

```ts
        videoProvider: row.videoProvider as VideoProviderType | null,
        videoModel: row.videoModel,
```

- [ ] **Step 4: Persistir en `saveConfig`**

En la llamada `this._aiConfigRepository.upsert(userId, { ... })`, agregar después de `imageModel: dto.imageModel,`:

```ts
      videoProvider: dto.videoProvider,
      videoModel: dto.videoModel,
```

- [ ] **Step 5: Extender el `upsert` del repositorio**

En `ai-config.repository.ts`, en el tipo del parámetro `data` de `upsert`, agregar después de `imageModel?: string | null;`:

```ts
      videoProvider?: string | null;
      videoModel?: string | null;
```

(El cuerpo `create: { userId, ...data }` / `update: data` ya propaga los campos nuevos sin cambios.)

- [ ] **Step 6: Commit**

```bash
git add libraries/nestjs-libraries/src/database/prisma/ai-config/ai-config.service.ts libraries/nestjs-libraries/src/database/prisma/ai-config/ai-config.repository.ts
git commit -m "feat(ai): persist video provider/model in user AI config"
```

---

## Task 7: Validación en el controller PUT

**Files:**
- Modify: `apps/backend/src/api/routes/ai-config.controller.ts`

- [ ] **Step 1: Importar `VIDEO_PROVIDERS`**

En el import desde `ai.types`, agregar `VIDEO_PROVIDERS`:

```ts
import {
  TEXT_PROVIDERS,
  IMAGE_PROVIDERS,
  VIDEO_PROVIDERS,
  TextProviderType,
} from '@gitroom/nestjs-libraries/ai/ai.types';
```

- [ ] **Step 2: Validar `videoProvider` en `saveConfig`**

En el método `saveConfig`, después del bloque que valida `body.imageProvider`, agregar:

```ts
    if (
      body.videoProvider &&
      !VIDEO_PROVIDERS.includes(body.videoProvider as any)
    ) {
      throw new HttpException(
        `Invalid videoProvider. Must be one of: ${VIDEO_PROVIDERS.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }
```

> El test de conexión de video reusa `provider: 'gemini'` en `/test` (ya soportado): valida la key de Google con una llamada barata y nunca genera video. No se agrega un caso nuevo en `/test`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/api/routes/ai-config.controller.ts
git commit -m "feat(ai): validate videoProvider on AI config save"
```

---

## Task 8: Sección "Video" en la UI de proveedores

**Files:**
- Modify: `postiz-frontend/apps/frontend/src/components/settings/ai-provider.component.tsx`

> A partir de aquí los comandos corren dentro de `postiz-frontend`.

- [ ] **Step 1: Extender las interfaces y el estado**

En `AiConfigResponse`, agregar:

```ts
  videoProvider?: string | null;
  videoModel?: string | null;
```

En `AiConfigFormState`, agregar:

```ts
  videoProvider: string;
  videoModel: string;
```

En `INITIAL_STATE`, agregar:

```ts
  videoProvider: '',
  videoModel: '',
```

- [ ] **Step 2: Agregar las opciones de proveedor/modelo de video**

Después de la constante `IMAGE_PROVIDERS`, agregar:

```ts
const VIDEO_PROVIDERS = [
  { value: '', label: 'None' },
  { value: 'google', label: 'Google Veo' },
];

const VIDEO_MODEL_OPTIONS: Record<string, { value: string; label: string }[]> =
  {
    google: [
      { value: 'veo-3.0-fast-generate-001', label: 'Veo 3 Fast' },
      { value: 'veo-3.0-generate-001', label: 'Veo 3' },
    ],
  };
```

- [ ] **Step 3: Hidratar el estado desde `data`**

En el `useEffect` que setea el form desde `data`, agregar dentro del objeto pasado a `setForm`, después de `imageModel: data.imageModel || '',`:

```ts
        videoProvider: data.videoProvider || '',
        videoModel: data.videoModel || '',
```

- [ ] **Step 4: Reset del modelo al cambiar de proveedor de video**

En `updateForm`, después del bloque `if (field === 'imageProvider') { ... }`, agregar:

```ts
        if (field === 'videoProvider') {
          const models = VIDEO_MODEL_OPTIONS[value];
          next.videoModel = models?.[0]?.value || '';
        }
```

- [ ] **Step 5: Incluir Google en `requiredProviders` cuando hay video**

En `requiredProviders`, antes del `return`, agregar:

```ts
    // Video (Google Veo) reusa la key de Gemini/Google.
    if (form.videoProvider === 'google') providers.add('gemini');
```

Y actualizar el array de dependencias del `useCallback` para incluir `form.videoProvider`.

- [ ] **Step 6: Enviar los campos en `handleSave`**

En el body del `fetch('/user/ai-config', { method: 'PUT', ... })`, agregar después de `imageModel: form.imageModel || null,`:

```ts
          videoProvider: form.videoProvider || null,
          videoModel: form.videoModel || null,
```

- [ ] **Step 7: Renderizar la tarjeta "Video Generation"**

Después del bloque JSX `{/* Image Generation Card */}` (la `<div>` que lo cierra), insertar:

```tsx
      {/* Video Generation Card */}
      <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
        <div className="text-[16px] font-medium">
          {t('ai_video_generation', 'Video Generation')}
        </div>

        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px]">{t('ai_video_provider', 'Provider')}</div>
          <select
            value={form.videoProvider}
            onChange={(e) => updateForm('videoProvider', e.target.value)}
            className="h-[42px] bg-newBgColorInner px-[16px] outline-none border-newTableBorder border rounded-[8px] text-[14px]"
          >
            {VIDEO_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {form.videoProvider && (
          <>
            <div className="flex flex-col gap-[6px]">
              <div className="text-[14px]">{t('ai_video_model', 'Model')}</div>
              <select
                value={form.videoModel}
                onChange={(e) => updateForm('videoModel', e.target.value)}
                className="h-[42px] bg-newBgColorInner px-[16px] outline-none border-newTableBorder border rounded-[8px] text-[14px]"
              >
                {(VIDEO_MODEL_OPTIONS[form.videoProvider] || []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[12px] text-customColor18 bg-newBgColorInner border-newTableBorder border rounded-[8px] p-[12px]">
              {t(
                'ai_video_uses_google_key',
                'Video generation uses your Google Gemini API key configured below.'
              )}
            </div>
          </>
        )}
      </div>
```

- [ ] **Step 8: Verificar typecheck del frontend**

Run (desde `postiz-frontend`):
```bash
pnpm build:frontend
```
Expected: build sin errores de TypeScript en `ai-provider.component.tsx`.
(Si `build:frontend` es muy lento en tu entorno, al menos corre el linter del archivo: `pnpm exec eslint apps/frontend/src/components/settings/ai-provider.component.tsx`.)

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/components/settings/ai-provider.component.tsx
git commit -m "feat(ai): add Video Generation (Google Veo) section to AI providers UI"
```

---

## Task 9: Gate de typecheck backend + smoke end-to-end

**Files:** ninguno (verificación).

- [ ] **Step 1: Correr toda la suite de tests nueva (backend)**

Run (desde `postiz-backend`):
```bash
pnpm exec vitest run libraries/nestjs-libraries/src/ai/__tests__/video-types.test.ts libraries/nestjs-libraries/src/ai/__tests__/google-veo.adapter.test.ts
```
Expected: PASS (5 tests en total).

- [ ] **Step 2: Typecheck/build del backend**

Run:
```bash
pnpm build:backend
```
Expected: build exitoso. Esto valida resolver, service, repository y controller (alias `@gitroom/*`) que no se testean con vitest.

- [ ] **Step 3: Smoke manual en la app**

1. Arrancar backend + frontend (`pnpm dev:backend` en backend, `pnpm dev:frontend` en frontend) y aplicar el schema con `pnpm run prisma-db-push` (backend).
2. En la app, ir a **Settings → AI provider**.
3. Verificar que aparece la tarjeta **"Video Generation"** con proveedor `Google Veo` y modelos `Veo 3 Fast` / `Veo 3`.
4. Seleccionar `Google Veo`, ingresar/confirmar la key de Google Gemini en **API Keys**, pulsar **Test** (debe pasar la validación de la key Google), y **Save Configuration**.
5. Recargar la página: el proveedor y modelo de video persisten; la key aparece como guardada (`****xxxx`).

Expected: la configuración de video se guarda y persiste; el test de key Google pasa; no se genera ningún video real en este flujo.

- [ ] **Step 4: Commit (si hubo ajustes durante el smoke)**

```bash
git add -A
git commit -m "test(ai): verify Fase A video provider config end-to-end"
```

---

## Self-Review (cobertura del spec)

- **Schema `videoProvider`/`videoModel`** → Task 1.
- **`VIDEO_PROVIDERS` / `DEFAULT_VIDEO_MODELS` / aspect map** → Task 2.
- **`VideoProvider` / `VideoOptions` (con campos forward-looking B/C)** → Task 3.
- **`GoogleVeoAdapter` (`@google/genai`, polling, upload, `{ url }`)** → Tasks 0 + 4.
- **`getVideoProvider` + caché + invalidación (reusa key `gemini`)** → Task 5.
- **Service/repository persistencia** → Task 6.
- **Validación controller PUT; `/test` reusa `gemini`** → Task 7.
- **UI sección Video (sin key propia, reusa Google)** → Task 8.
- **kie.ai Veo3 intacto** → no se toca ningún archivo de `videos/`.
- **Sin gating de créditos / sin panel / sin nodos** → fuera de alcance, no hay tasks.
- **Test sin video real / sin créditos** → Task 7 nota + Task 9 Step 3.
