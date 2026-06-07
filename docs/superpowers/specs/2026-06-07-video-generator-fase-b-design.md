# Diseño — Fase B: Generador de Vídeos con IA

**Fecha:** 2026-06-07
**Repos:** `postiz-backend`, `postiz-frontend` (forks split)
**Estado:** Aprobado (diseño) — pendiente plan de implementación
**Depende de:** Fase A (`getVideoProvider`, `GoogleVeoAdapter`, `UserAiConfig.videoProvider/videoModel`)

## Contexto

Fase A dejó un `VideoProvider` (Google Veo vía `@google/genai`) configurable por usuario,
pero sin UI de generación. Fase B agrega el **panel generador** fiel a las refs (sección
dedicada con tabs Texto/Imagen a Vídeo y sub-tabs Fotogramas/Ingredientes).

Estado actual relevante del fork (verificado):
- Generación de imagen y el viejo `/media/generate-video` ya usan créditos:
  `SubscriptionService.checkCredits(org, 'ai_videos')` + `useCredit(org, 'ai_videos', fn)`
  (deduce 1 fila en modelo `Credits` primero, reembolsa borrándola si la función lanza).
  Límites por tier en `pricing.ts` (`generate_videos`). El bloqueo solo aplica si
  `process.env.STRIPE_PUBLISHABLE_KEY` está seteado (comportamiento actual del fork).
- El viejo `/media/generate-video` usa el registry `@Video` (clase `veo3`, `KIEAI_API_KEY`
  env). Las clases `@Video` no tienen DI de `AiProviderResolver` → no se reusa ese camino.
- **Temporal está desplegado**: `backend` = cliente (`getTemporalModule(false)`),
  `orchestrator` = worker (`getTemporalModule(true, ...workflows, activities)`), ya usado
  para posts/autopost/notificaciones/email. Compose wirea `TEMPORAL_ADDRESS`.
- SDK `@google/genai` v2.8.0 soporta todo lo necesario (verificado en `genai.d.ts`):
  `GenerateVideosParameters.image` (frame inicial, tipo `Image_2 {imageBytes, mimeType}`),
  `config.lastFrame` (frame final; solo image-to-video), `config.referenceImages`
  (`VideoGenerationReferenceImage[] {image, referenceType}`; máx 3 asset / 1 style; exige
  prompt y NO admite `image`/`lastFrame`), `config.durationSeconds`, `config.seed`,
  `config.numberOfVideos`, `config.aspectRatio`, `config.negativePrompt`,
  `config.generateAudio`. Resultado: `operation.response.generatedVideos[].video.uri`.

## Objetivo y alcance

Panel dedicado "Generador de Vídeos con IA" que genera videos con Google Veo (proveedor de
Fase A), de forma **asíncrona** (Temporal + polling), guardando el resultado en la media
library. Cubre los **tres modos**: Texto→Vídeo, Imagen→Vídeo (Fotogramas inicio/fin) e
Ingredientes (referencias). Gating de créditos con el mecanismo existente.

**No incluye:** editor de nodos, encadenamiento automático de clips, continuidad multi-clip
(Fase C); auto-enhance de prompt con IA (✨); visibilidad pública.

## Decisiones

- **Sección dedicada** (página nueva en el frontend), no el composer. El video va a la media
  library; el usuario lo adjunta al post después.
- **Endpoint nuevo** que invoca `getVideoProvider(userId)` directo desde `MediaService`
  (inyecta `AiProviderResolver`). No se toca el registry `@Video`/veo3.
- **Async vía Temporal**: encolar workflow → polling de estado. Durable ante reinicios.
- **Restricción de modos** (impuesta por el SDK): Fotogramas (image[+lastFrame]) e
  Ingredientes (referenceImages) son mutuamente excluyentes. Los sub-tabs ya los separan.
- **Créditos**: deduce N filas (N = nº videos) al encolar; reembolsa las N si el job falla.

## Modos ↔ mapping SDK Veo

| Modo (UI) | params/config del SDK |
|---|---|
| Texto→Vídeo | `prompt` + config(aspectRatio, durationSeconds, seed, numberOfVideos, negativePrompt) |
| Fotogramas (Imagen→Vídeo) | `image` = startImage; `config.lastFrame` = endImage (si toggle "agregar fotograma final"); `prompt` opcional + config(...) |
| Ingredientes | `prompt` (requerido) + `config.referenceImages` = referenceImages.map(r ⇒ `{ image:r, referenceType:'asset' }`) + config(...) |

Validación: si hay `referenceImages`, NO enviar `image`/`lastFrame` (y viceversa).

## Backend

### Adapter (`ai/adapters/video/google-veo.adapter.ts`)
Extender `generateVideo(prompt, options)` para mapear `VideoOptions` completo:
- `params.image` ← `options.startImage` (`{ imageBytes: base64, mimeType }`).
- `config.lastFrame` ← `options.endImage` (solo si hay `startImage`).
- `config.referenceImages` ← `options.referenceImages` → `[{ image:{imageBytes,mimeType}, referenceType:'asset' }]`.
- `config.durationSeconds`, `config.seed`, `config.numberOfVideos` (default 1),
  `config.aspectRatio` (vía `VEO_ASPECT_MAP`), `config.negativePrompt`.
- Recolectar **todas** las URLs: `response.generatedVideos.map(v => v.video.uri)`, descargar
  cada una (`${uri}&key=`), subir cada una vía `uploadSimple`.
- Cambiar `VideoGenerationResult` a `{ urls: string[] }` (actualizar interface + el test de
  Fase A que espera `{ url }` → `{ urls:[...] }`).
- Confirmar nombres exactos de campos `Image_2`/`VideoGenerationReferenceImage` contra
  `genai.d.ts` en implementación (ya verificados: `imageBytes`, `mimeType`, `image`,
  `referenceType`).

### Prisma — modelo `VideoGenerationJob`
```prisma
model VideoGenerationJob {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  status         String   @default("processing") // processing | done | error
  mode           String   // text | frames | ingredients
  params         Json
  resultMediaIds Json?    // string[] de Media.id cuando done
  error          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@map("video_generation_job")
}
```
Migración + `prisma-generate`. (Relación inversa en `Organization` si Prisma la exige.)

### Endpoints (`media.controller.ts`)
- `POST /media/ai-video` (body: `mode`, `prompt?`, `aspectRatio`, `durationSeconds?`, `seed?`,
  `numberOfVideos`, `startImage?`, `endImage?`, `referenceImages?`):
  1. `checkCredits(org, 'ai_videos')`; si `STRIPE_PUBLISHABLE_KEY` y `credits < numberOfVideos`
     → 402/false.
  2. Validar exclusividad modo↔params y MIME de imágenes (`ALLOWED_REFERENCE_MIME_TYPES`).
  3. Deduce N créditos (crea N filas `Credits` type `ai_videos`).
  4. Crea `VideoGenerationJob` (status `processing`).
  5. Arranca workflow Temporal (`videoGenerationWorkflow`, taskQueue 'main') con
     `{ jobId, userId, orgId, options }`.
  6. Devuelve `{ jobId }`.
- `GET /media/ai-video/:jobId`: devuelve `{ status, error?, media: [{id, path}] }` (media
  resuelta desde `resultMediaIds`). Verifica pertenencia a la org.

### Temporal (orchestrator)
- `apps/orchestrator/src/workflows/video-generation.workflow.ts`: workflow que llama la
  activity con timeout amplio (p.ej. 15 min) y la registra en `workflows/index.ts`.
- `apps/orchestrator/src/activities/video.activity.ts` (`@Activity`): DI de
  `AiProviderResolver`, `MediaService`/repos, `SubscriptionService`. Método `generate`:
  - `provider = getVideoProvider(userId)`; si null → marca job `error`.
  - `{ urls } = provider.generateVideo(prompt, options)`.
  - por cada url: `saveFile(orgId, name, url)`; junta los `Media.id`.
  - update job `done` + `resultMediaIds`.
  - en catch: update job `error` con mensaje + **refund** de las N filas de crédito
    creadas para este job; relanzar para que Temporal registre el fallo.
- El módulo de la activity en orchestrator debe importar `AiModule` para resolver
  `AiProviderResolver`/`AiConfigService`.

## Frontend

Sección dedicada nueva (página Next.js) con componentes pequeños y enfocados:
- Entrada en el sidebar/navegación principal ("Generador de Vídeos").
- `video-generator.page.tsx` (contenedor + estado de form + submit + polling).
- Header: muestra proveedor/modelo desde `useAiConfig()`; si no hay `videoProvider`
  configurado → mensaje + link a Settings → AI provider.
- Tabs **Texto a Vídeo** / **Imagen a Vídeo**.
  - Imagen → sub-tabs **Fotogramas** (subir imagen + toggle "agregar fotograma final" →
    segunda imagen) / **Ingredientes** (hasta 3 imágenes de referencia).
- Controles: `prompt` (textarea), aspect 16:9 / 9:16 / Auto, duración 4 / 6 / 8s, seed
  (numérico), nº videos (1 / 2 / 4), "Créditos requeridos" = nº videos.
- Imágenes → base64 (`{ mimeType, base64 }`) con el patrón de `ai.image.tsx`.
- Botón **Generar Vídeo** → `POST /media/ai-video` → guarda `jobId` → **polling** a
  `GET /media/ai-video/:jobId` con backoff (p.ej. cada 5s) hasta `done`/`error`.
- Resultados: galería con preview de cada video; quedan en la media library.

## Errores / async
- Job `error` guarda el mensaje del proveedor; el adapter ya tiene timeout (10 min) → error
  + refund. El workflow Temporal es durable: un reinicio del backend no pierde el job.
- Polling tolera `processing` prolongado; muestra estado en la UI.

## Testing
- vitest (alias-free, mock SDK):
  - Adapter extendido: verifica que `image`/`lastFrame`/`referenceImages`/`durationSeconds`/
    `seed`/`numberOfVideos`/`aspectRatio`/`negativePrompt` se mapean correctamente; que con
    `numberOfVideos>1` descarga+sube cada uno y retorna `{ urls: [...] }`.
  - Exclusividad modo↔params (helper de validación puro): referenceImages + image → error.
- Build/typecheck: `pnpm build:backend` (resolver/service/controller/activity con alias).
- Smoke manual: configurar Google Veo en Settings, generar en cada modo, ver el job pasar a
  `done` y el/los video(s) en la media library.

## Fuera de alcance (→ Fase C)
Editor de nodos (reactflow), encadenamiento automático último-frame→primer-frame entre
clips, continuidad multi-clip, auto-enhance de prompt (✨), visibilidad pública.
