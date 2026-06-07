# Diseño — Fase A: Proveedor de video (Google Veo) en AI Providers

**Fecha:** 2026-06-07
**Repos:** `postiz-backend`, `postiz-frontend` (forks split)
**Estado:** Aprobado (diseño) — pendiente plan de implementación

## Contexto

El fork ya tiene multi-AI provider (texto/imagen: Anthropic/OpenAI/Gemini) con keys
encriptadas (AES-256-GCM) y un `AiProviderResolver` con caché por usuario. También
existe un módulo de video aparte (`VideoAbstract` + decorador `@Video` + registry
`VideoManager`), con un único tipo `veo3` que llama a `api.kie.ai` usando
`KIEAI_API_KEY` (env global) — **no** conectado al config multi-AI ni a keys por usuario.

Esta feature es la primera de tres fases independientes:

- **Fase A (este spec):** configurar un modelo de video de Google (Veo) en la sección
  de proveedores de IA. Deja listo un `VideoProvider` reutilizable.
- **Fase B (spec aparte):** panel "Generador de Vídeos con IA" (Texto→Vídeo,
  Imagen→Vídeo: fotogramas inicio/fin, ingredientes; aspect ratio, duración, seed).
- **Fase C (spec aparte):** editor de nodos (canvas reactflow) Texto→Imagen→Video con
  coherencia/continuidad (encadenado de frames + referencias compartidas).

B y C consumen el `VideoProvider` que entrega A.

## Objetivo y alcance

Permitir configurar un **modelo de video de Google (Veo)** en la sección de proveedores
de IA, igual que ya se configuran texto e imagen: selector de proveedor + modelo + key
encriptada (reusada) + test de conexión. El backend deja un `VideoProvider` que las
Fases B y C consumirán.

**No incluye:** UI de generación, panel generador, editor de nodos, gating de créditos
en generación, jobs en background.

## Decisiones

- **SDK:** Veo no existe en `@google/generative-ai` (el actual). Se agrega `@google/genai`
  (SDK unificado) → `generateVideos` + polling de operación. Aislado en el adapter; no
  toca los adapters Gemini existentes. IDs exactos de modelo y superficie del SDK se
  confirman contra docs de Google durante implementación (vía context7).
- **Key:** se reutiliza la key **`gemini`** (la misma Google AI key sirve para Veo). La
  sección Video **no** pide key nueva. `EncryptedKeysSchema` no cambia.
- **Test de conexión:** validación **barata** (verificar acceso al modelo Veo / llamada
  ligera de metadata), **no** genera video real (Veo tarda minutos y gasta créditos).
  Reusa el endpoint `/test` con el rate-limit existente (5/min).
- **Async:** Veo es long-running. El adapter `generateVideo()` hace polling inline (como
  el veo3 actual) y resuelve a una URL. Se diseña awaitable para que B/C puedan migrar a
  job/cola en background sin romper el contrato.
- **Créditos:** el gating real es responsabilidad de B/C (donde se genera). En Fase A el
  `/test` debe ser gratis/barato y no consumir créditos.
- **kie.ai Veo3 actual:** se deja intacto como tipo `@Video` separado. No se borra en A.

## Cambios — Backend

### Schema (`schema.prisma`, modelo `UserAiConfig`)
Agregar:
```prisma
videoProvider String?   // 'google'
videoModel    String?   // e.g. 'veo-3.x'
```
Migración Prisma + `prisma generate`.

### `ai/ai.types.ts`
```ts
export const VIDEO_PROVIDERS = ['google'] as const;
export type VideoProviderType = (typeof VIDEO_PROVIDERS)[number];
export const DEFAULT_VIDEO_MODELS: Record<VideoProviderType, string> = {
  google: 'veo-3.x', // confirmar id exacto contra docs
};
// maps de aspect ratio y duraciones soportadas por Veo
```
`EncryptedKeysSchema` **no cambia** (video reusa `gemini`).

### `ai/ai.interfaces.ts`
```ts
export interface VideoOptions {
  aspectRatio: '16:9' | '9:16' | 'auto';
  durationSeconds?: number;            // 4/6/8 — usado por Fase B
  seed?: number;                       // Fase B
  startImage?: ImageReference;         // Fase C: encadenado de frame
  endImage?: ImageReference;           // Fase C: "agregar fotograma final"
  referenceImages?: ImageReference[];  // Fase C: ingredientes / personaje
  negativePrompt?: string;
}

export interface VideoProvider {
  generateVideo(prompt: string, opts: VideoOptions): Promise<{ url: string }>;
}
```
Las opciones de B/C ya van en la interfaz para no romper el contrato más adelante.
El adapter de Fase A solo implementa el subconjunto necesario (prompt + aspectRatio);
las demás opciones se pasan cuando lleguen B/C.

### `ai/adapters/video/google-veo.adapter.ts` (nuevo)
- `implements VideoProvider`.
- Usa `@google/genai`: `generateVideos({ model, prompt, config })` → operación →
  poll `getVideosOperation` hasta `done`.
- Descarga el resultado y lo sube vía la upload factory existente
  (`local` / `cloudflare`); devuelve `{ url }`.
- Manejo de errores: timeout de polling, error de operación, key inválida → throw con
  mensaje claro.

### `ai/ai.provider-resolver.ts`
- `async getVideoProvider(userId): Promise<VideoProvider | null>` siguiendo el patrón de
  `getImageProvider` (lee `getDecryptedKeys`, toma key `gemini`, modelo
  `videoModel ?? DEFAULT_VIDEO_MODELS.google`, crea adapter, cachea).
- Nuevo `videoCache` (LRU, mismas opciones).
- `invalidateCache(userId)` también borra `videoCache`.

### `database/prisma/ai-config/ai-config.service.ts`
- `UserAiConfigDto` y `UserAiConfigResponse`: + `videoProvider?`, `videoModel?`.
- `decryptRow` y `saveConfig`: incluir los dos campos nuevos (keys sin cambios — el
  upsert ya hace merge de `encryptedKeys`).
- Repositorio `upsert`: persistir `videoProvider`, `videoModel`.

### `apps/backend/src/api/routes/ai-config.controller.ts`
- `PUT /`: validar `body.videoProvider` contra `VIDEO_PROVIDERS` (igual que image).
- `POST /test`: la sección Video, al reusar la key Google, dispara el test con
  `provider: 'gemini'` (ya soportado, valida la key Google con una llamada barata). No se
  agrega un caso Veo dedicado en Fase A y **nunca** se genera video real en el test.

## Cambios — Frontend

### `apps/frontend/src/components/settings/ai-provider.component.tsx`
- Nueva sección **"Video"** debajo de Imagen.
- `VIDEO_PROVIDERS = [{ '', 'None' }, { 'google', 'Google Veo' }]`.
- `VIDEO_MODEL_OPTIONS.google = [{ Veo 3.1 }, { Veo 3 Fast }, ...]` (confirmar ids).
- Estado del form: + `videoProvider`, `videoModel`; `updateForm` resetea `videoModel` al
  cambiar `videoProvider` (igual que image).
- **Sin campo de key propio**: reusa la key de Google/Gemini.
- `requiredProviders()`: si `videoProvider === 'google'`, agregar la key `gemini` al set.
- Botón **Test** que pega a `/user/ai-config/test`.
- No se agrega tab nuevo (el panel Generador es Fase B).

## Manejo de errores

- Key Google ausente cuando `videoProvider='google'` → el resolver devuelve `null`
  (consumidores muestran "configura tu proveedor de video").
- Operación Veo falla / timeout → adapter lanza error con mensaje del proveedor.
- Test con key inválida → `{ success:false, message }` (patrón actual).

## Testing

- Reusar tests de encriptación existentes (sin cambios).
- Nuevos:
  - `getVideoProvider` con config mock (key presente / ausente → null).
  - Validación PUT del controller (videoProvider inválido → 400).
  - Adapter Google Veo con `@google/genai` mockeado (operación → `{ url }`); error de
    operación → throw.

## Fuera de alcance (Fases B/C)

Panel "Generador de Vídeos con IA", Texto/Imagen→Vídeo, fotogramas inicio/fin,
ingredientes, editor de nodos (reactflow), gating de créditos en generación, jobs en
background. La interfaz `VideoOptions` ya prevé sus necesidades para no romper contratos.
