# ironclad-auth

Authorization service (RBAC, token exchange, admin API) for the Ironclad Auth system. Validates OIDC identity-provider tokens and owns permission data in Postgres.

## Stack

Node 22, TypeScript (strict), Hono, `@hono/zod-openapi`, Drizzle + Postgres (from Phase 1), Vitest, Biome.

## Local dev

```bash
pnpm install
pnpm dev
```

- Health: `GET http://localhost:3000/healthz`
- API docs: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Docker

```bash
docker compose up --build
```

Postgres is included for local development; the app does not require a database connection in Phase 0.

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
