# Split Frontend And Backend

This project can be split into two deployable repositories without changing the application code paths.

## Recommended Repository Layout

Keep the frontend repository rooted at the current monorepo root, not at `apps/frontend` only. The Next.js app imports shared code through `@gitroom/*`, so the frontend repo still needs these paths:

- `apps/frontend`
- `libraries/helpers`
- `libraries/react-shared-libraries`
- `libraries/nestjs-libraries` for shared utilities imported by frontend code
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.json`, `tsconfig.base.json`

The backend repository should keep:

- `apps/backend`
- `apps/orchestrator`
- `libraries`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.json`, `tsconfig.base.json`
- `Dockerfile.backend`, `docker-compose.backend.yaml`, `var/docker/nginx.backend.conf`, `var/docker/ecosystem.backend.config.cjs`, `var/docker/entrypoint.backend.sh`

## Vercel Frontend

Use the repository root as Vercel's root directory. The included `vercel.json` builds only the frontend:

```bash
pnpm run build:frontend
```

Set these Vercel environment variables:

```env
FRONTEND_URL=https://app.your-domain.com
NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.com/api
BACKEND_INTERNAL_URL=https://api.your-domain.com/api
BACKEND_URL=https://api.your-domain.com/api
JWT_SECRET=the-same-value-used-by-backend
IS_GENERAL=true
STORAGE_PROVIDER=cloudflare
NEXT_PUBLIC_UPLOAD_DIRECTORY=/uploads
```

If Sentry is not configured, also set:

```env
SENTRY_DISABLE=true
DISABLE_SOURCE_MAPS=true
```

## Backend Server

Deploy the backend-only stack with:

```bash
docker compose -f docker-compose.backend.yaml up -d --build
```

Set these backend environment variables:

```env
FRONTEND_URL=https://app.your-domain.com
BACKEND_PUBLIC_URL=https://api.your-domain.com
JWT_SECRET=the-same-value-used-by-frontend
ENCRYPTION_KEY=64-hex-character-key
```

Keep all database, Redis, Temporal, storage, social provider and payment variables on the backend server.

## Important Notes

- Use subdomains under the same root domain for production, for example `app.your-domain.com` on Vercel and `api.your-domain.com` on the backend server. Auth cookies are scoped from `FRONTEND_URL`; using an unrelated `*.vercel.app` frontend with a different backend domain can make browsers reject login cookies.
- Use Cloudflare/R2 storage for production. Local `/uploads` stay on the backend host and can be served through `https://api.your-domain.com/uploads/...`, but Vercel will not share that filesystem.
- Update OAuth provider callbacks to the Vercel frontend URL, for example `https://app.your-domain.com/integrations/social/google`.
- Backend CORS already allows `FRONTEND_URL`, so cross-origin cookies work only when both frontend and backend use HTTPS.
- The old `docker-compose.yaml` remains unchanged and can still run the combined deployment until migration is complete.
