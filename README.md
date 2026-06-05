# Postiz Backend

Backend deployable for Postiz with API, orchestrator, Postgres, Redis and Temporal.

## Docker Compose

```bash
docker compose -f docker-compose.backend.yaml up -d --build
```

Required production variables:

```env
FRONTEND_URL=https://app.your-domain.com
BACKEND_PUBLIC_URL=https://api.your-domain.com
JWT_SECRET=the-same-value-used-by-frontend
ENCRYPTION_KEY=64-hex-character-key
```

Keep database, Redis, storage, social provider and payment variables on the backend server.
