# ironclad-auth

Authorization service (RBAC, token exchange, admin API) for the Ironclad Auth system. Validates OIDC identity-provider tokens and owns permission data in Postgres.

## Stack

Node 22, TypeScript (strict), Hono, `@hono/zod-openapi`, Drizzle + Postgres (from Phase 1), Vitest, Biome.

## Local dev

```bash
cp .env.example .env   # optional; defaults work for PORT
pnpm install
pnpm dev
```

- Health: `GET http://localhost:3000/healthz`
- API docs: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Docker

Builds a production image (Node 22 Alpine, non-root `node` user).

```bash
docker compose up --build
```

Services: **app** (this API on port 3000) and **Postgres 16** on port 5432. `DATABASE_URL` is injected for later phases; the Phase 0 server does not connect to the database yet.

## Scripts

| Command       | Description              |
| ------------- | ------------------------ |
| `pnpm dev`    | Dev server with hot reload |
| `pnpm build`  | Compile to `dist/`       |
| `pnpm start`  | Run compiled app         |
| `pnpm test`   | Run tests                |
| `pnpm lint`   | Biome check              |

## License

TBD
