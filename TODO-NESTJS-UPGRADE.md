# TODO: Upgrade NestJS 10 → 11 (diferido)

Pendiente de la migración upstream 2026-06 (`migrate/upstream-2026-06`). Se difirió por ser un upgrade mayor riesgoso. El código migrado compila contra NestJS 10; este upgrade es independiente.

## Qué actualizar (versiones de upstream `gitroomhq/postiz-app` a 2026-06-05)

En `package.json`:

```
@nestjs/cli         10.0.2   → ^11.0.21
@nestjs/common      ^10.0.2  → ^11.1.21
@nestjs/core        ^10.0.2  → ^11.1.21
@nestjs/microservices ^10.3.1 → ^11.1.21
@nestjs/platform-express ^10.0.2 → ^11.1.21
@nestjs/schedule    ^4.0.0   → ^6.1.3
@nestjs/swagger     ^7.3.0   → ^11.4.3
@nestjs/throttler   ^6.3.0   → ^6.5.0
@nestjs/schematics  ^10.0.1  → ^11.1.0   (devDep)
@nestjs/testing     ^10.0.2  → ^11.1.21  (devDep)
reflect-metadata    ^0.1.13  → ^0.2.2
next                16.2.1   → 16.2.6     (también en frontend, security)
eslint-config-next  16.2.1   → 16.2.6
```

## Pasos
1. Bumpear versiones en `postiz-backend/package.json` Y `postiz-frontend/package.json` (deps compartidas).
2. `pnpm install` en ambos repos.
3. Revisar breaking changes NestJS 10→11: https://docs.nestjs.com/migration-guide
   - Express 5 bajo platform-express 11 (cambios en routing/path-to-regexp).
   - `@nestjs/throttler`, `@nestjs/swagger` v11 APIs.
4. Typecheck + build de los 3 apps (backend, orchestrator, frontend).
5. Probar arranque y endpoints clave antes de prod.

## Referencia
Commits upstream relevantes: `38b0ac8c` (update nestjs), `2316a453` (upgrade nextjs security).
