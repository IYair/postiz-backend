# Diseño — Fase C: Editor de nodos Texto→Imagen→Vídeo

**Fecha:** 2026-06-10
**Repos:** `postiz-backend`, `postiz-frontend` (forks split)
**Estado:** Aprobado (diseño) — plan en `docs/superpowers/plans/2026-06-10-video-node-editor-fase-c.md`
**Depende de:** Fase A (`getVideoProvider`, `GoogleVeoAdapter`) y Fase B (`POST /media/ai-video` + `VideoGenerationJob` + Temporal).

## Contexto

Fases A y B dejaron: adapter Veo completo (`startImage`/`endImage`/`referenceImages`/`durationSeconds`/`seed`/`numberOfVideos` → `{ urls: string[] }`), endpoints async (`POST /media/ai-video` → `{ jobId }`, `GET /media/ai-video/:jobId` → `{ status, error, media }`), créditos `ai_videos` con refund, y generación de imagen (`POST /media/generate-image-with-prompt` → `{ id, path }`, créditos `ai_images`).

Fase C (alcance fijado en brainstorming 2026-06-07): **editor de nodos** (canvas) Texto→Imagen→Vídeo con **coherencia entre clips**: encadenado último-frame→primer-frame y referencias compartidas.

**Bug latente detectado (se arregla en este plan):** en `media.controller.ts` el catch-all `@Post('/:endpoint')` (R2 upload, ~línea 216) está declarado ANTES de `@Post('/ai-video')` (~línea 272). Express registra rutas en orden de declaración → `POST /media/ai-video` cae en `handleR2Upload`. Hay que mover los POST de ai-video (y los nuevos) por encima del catch-all.

## Decisiones

1. **Orquestación client-side (v1).** El editor ejecuta el grafo en orden topológico, secuencialmente, llamando a los endpoints existentes: imagen → `POST /media/generate-image-with-prompt`; vídeo → `POST /media/ai-video` + polling. Cada clip es un `VideoGenerationJob` durable (Temporal), así que un clip nunca se pierde a media generación; lo que se pierde si el usuario cierra la pestaña es la *continuación* de la cadena (aceptado en v1; cadena server-side con workflow Temporal queda como evolución futura).
2. **Último frame: backend con ffmpeg.** Nuevo endpoint `POST /media/reference-from-media { mediaId }` → `{ mimeType, base64 }`. Si la media es vídeo (por extensión), extrae el último frame con `ffmpeg -sseof -0.5 … -frames:v 1` (jpeg); si es imagen, descarga y devuelve base64. Razones: el capture client-side con `<video>`+canvas sufre CORS/canvas tainting según el storage (local vs R2), y el backend es testeable. **Requiere agregar `ffmpeg` al stage runner del `Dockerfile.backend`** (hoy no está).
3. **Librería de canvas: `@xyflow/react`** (sucesor de reactflow; reactflow legacy NO). No está instalada — se agrega al frontend.
4. **`numberOfVideos = 1` por nodo de vídeo.** El encadenado necesita una salida única por clip. (El panel de Fase B sigue permitiendo 1/2/4.)
5. **Persistencia: localStorage** (autosave de nodos/edges, sin los base64 de uploads). Sin modelo Prisma de flows en v1 (YAGNI).
6. **Sin auto-enhance ✨ en nodos de vídeo** (igual que Fase B). El nodo de imagen sí expone el toggle "enhance prompt" porque `generate-image-with-prompt` ya lo soporta (`skipExpansion`).

## Tipos de nodo y conexiones

| Nodo | Inputs (handles target) | Output (handle source) | Datos propios |
|---|---|---|---|
| **Prompt** (`text`) | — | `prompt-out` (string) | `prompt` |
| **Imagen** (`image`) | `prompt-in` (≤1, desde `prompt-out`) | `image-out` (media/ref) | `source: generate\|upload`, `prompt`, `aspectRatio`, `enhancePrompt`, `upload` |
| **Vídeo** (`video`) | `prompt-in` (≤1), `start-in` (≤1, desde `image-out` o `video-out`), `ref-in` (≤3, desde `image-out`) | `video-out` (media) | `prompt`, `aspectRatio`, `durationSeconds`, `seed`, `negativePrompt` |

Reglas de conexión (validadas al conectar, lógica pura testeable):
- Pares permitidos: `prompt-out→prompt-in`, `image-out→start-in`, `video-out→start-in` (encadenado: último frame del clip anterior), `image-out→ref-in`.
- `start-in` y `ref-in` son **mutuamente excluyentes** en un mismo nodo de vídeo (restricción del SDK Veo: `referenceImages` no admite `image`/`lastFrame`).
- Máx 3 edges en `ref-in`. Sin ciclos. Sin self-connections.

Modo efectivo del nodo de vídeo (se muestra en el nodo): `ref-in` conectado → `ingredients`; si no, `start-in` conectado → `frames`; si no → `text`. El prompt conectado pisa el prompt inline.

## Ejecución del grafo (frontend)

1. Orden topológico (Kahn) de todos los nodos; ejecución **secuencial**.
2. `text`: no llama red; su output es el prompt.
3. `image` modo `upload`: output = `{ mimeType, base64 }` directo. Modo `generate`: `POST /media/generate-image-with-prompt { prompt, aspectRatio, skipExpansion: !enhancePrompt }` → output = `{ mediaId, path }`.
4. `video`: resuelve inputs → si el input viene como media (imagen generada o vídeo del clip anterior), llama `POST /media/reference-from-media` para obtener `{ mimeType, base64 }` (para vídeos: último frame). Arma body de `POST /media/ai-video` (modo según conexiones, `numberOfVideos: 1`) y hace polling cada 5s (timeout ~15 min) hasta `done`/`error`.
5. Estado por nodo: `idle | running | done | error` renderizado en el nodo (badge). Error en un nodo aborta el resto del run (los clips ya generados quedan en la media library).
6. Créditos: los descuentan los endpoints existentes (`ai_images` por imagen generada, `ai_videos` por clip). La UI muestra "créditos de vídeo requeridos" = nº de nodos de vídeo.

## Backend — cambios (pequeños)

1. **Fix orden de rutas** en `media.controller.ts` (mover `@Post('/ai-video')` y el nuevo `@Post('/reference-from-media')` antes de `@Post('/:endpoint')`).
2. `Dockerfile.backend`: `ffmpeg` en el apt del stage runner.
3. Helpers puros `media-reference.helpers.ts`: `isVideoPath(path)` (por extensión — `Media.type` no es confiable: `saveFile` nunca lo setea) y `extractLastFrame(url)` (spawn ffmpeg → jpeg base64). Tests vitest con `child_process` mockeado.
4. `MediaService.mediaAsReference(orgId, mediaId)`: valida pertenencia (`media.organizationId === orgId`), vídeo → `extractLastFrame`; imagen → fetch + base64. **No** usa el guard SSRF de `fetchAsReference` (la URL viene de nuestra DB, y el guard rechaza `http://localhost` en dev).
5. Endpoint `POST /media/reference-from-media` (DTO `{ mediaId }`) → `{ mimeType, base64 }` | 404.

## Frontend — cambios

- Dep nueva: `@xyflow/react`.
- Página `app/(app)/(site)/video-flow/page.tsx` + entrada en `top.menu.tsx` (reusa el icono del item Video Generator — no crear SVGs nuevos).
- `components/video-flow/`: `flow-logic.ts` (lógica pura: validación de conexiones, ciclos, orden topológico, modo — con tests vitest alias-free), `video-flow.store.ts` (zustand + autosave localStorage), `file-utils.ts` (readFileAsBase64), `nodes/{text,image,video}.node.tsx` + `nodes/status.badge.tsx`, `run-flow.ts` (motor de ejecución), `video-flow.component.tsx` (canvas + toolbar + header proveedor).
- Header: si `useAiConfig().videoProvider` vacío → aviso + link a Settings (patrón Fase B).

## Manejo de errores

- Nodo de vídeo sin prompt en modo text/ingredients → el backend ya devuelve 400 con mensaje (`validateVideoModeParams`); el motor lo marca `error` en el nodo.
- `reference-from-media` con media ajena/inexistente → 404. ffmpeg falla/timeout (60s) → 500 con mensaje; nodo en `error`.
- Conexión inválida en el canvas → se rechaza y se muestra toaster con el motivo.
- Job de vídeo `error` → refund automático (mecanismo Fase B intacto).

## Testing

- **Backend (vitest, alias-free):** `isVideoPath`, `extractLastFrame` (mock spawn: éxito / exit≠0 / sin output). Typecheck `pnpm build:backend`.
- **Frontend (vitest, alias-free):** `flow-logic` — pares de handles, exclusividad start/ref, máx 3 refs, detección de ciclos, orden topológico, `resolveVideoMode`.
- **Smoke manual:** flujo Prompt→Imagen→Vídeo→Vídeo encadenado; verificar continuidad de frames y refs compartidas; clips en media library.

## Fuera de alcance (futuro)

Cadena server-side durable (workflow Temporal de grafo completo), persistencia de flows en DB, multi-flow, auto-enhance ✨ de prompts de vídeo, `numberOfVideos>1` en nodos, export/timeline de clips concatenados (stitching).
