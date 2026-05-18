# ironclad-auth

Authorization service (RBAC, token exchange, admin API) for the Ironclad Auth system. Validates OIDC identity-provider tokens and owns permission data in Postgres.

## Stack

Node 22, TypeScript (strict), Hono, `@hono/zod-openapi`, Drizzle + Postgres (from Phase 1), Vitest, Biome.

## Local dev

```bash
cp .env.example .env   # sets PORT + DATABASE_URL for docker-compose Postgres
pnpm install
docker compose up -d postgres   # or use your own Postgres 16+
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Health: `GET http://localhost:3000/healthz`
- API docs: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`
- With IdP env set: `GET http://localhost:3000/v1/whoami` with `Authorization: Bearer <IdP access token>` returns the linked internal `userId` and IdP `sub`.

## Identity provider (Phase 2)

The process entrypoint validates **OIDC access tokens** from your IdP (Auth0 by default) using **`IDP_ISSUER`**, **`IDP_AUDIENCE`**, and **`IDP_JWKS_URI`**. JWKS keys are re-fetched on a background interval in normal runtime (skipped under Vitest to avoid open handles).

Set the three `IDP_*` variables in `.env` (see `.env.example`). On first successful verification of a subject, a **`users`** row and **`provider_links`** row are created automatically.

## Docker

Builds a production image (Node 22 Alpine, non-root `node` user).

```bash
docker compose up --build
```

Services: **app** (this API on port 3000) and **Postgres 16** on port 5432. Set `DATABASE_URL` in `.env` to match `docker-compose.yml` credentials when running migrations or the app locally.

## Scripts

| Command       | Description              |
| ------------- | ------------------------ |
| `pnpm dev`    | Dev server with hot reload |
| `pnpm build`  | Compile to `dist/`       |
| `pnpm start`  | Run compiled app         |
| `pnpm test`   | Run tests                |
| `pnpm lint`   | Biome check              |
| `pnpm db:generate` | Create SQL migrations from `src/db/schema.ts` (dev) |
| `pnpm db:migrate` | Apply migrations (`DATABASE_URL` required)        |
| `pnpm db:seed`    | Load demo org/app/user/RBAC rows (idempotent)      |

## Contributing

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for branch workflow, local commands, and **how to configure branch protection** so `main` cannot receive direct pushes without passing CI.

## License

TBD
