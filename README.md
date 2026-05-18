# ironclad-auth

Authorization service (RBAC, token exchange, admin API) for the Ironclad Auth system. Validates OIDC identity-provider tokens and owns permission data in Postgres.

## Stack

Node 22, TypeScript (strict), Hono, `@hono/zod-openapi`, Drizzle + Postgres, Vitest, Biome.

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
- With IdP env set and the app wired with `db` + `idp` (see `src/index.ts`):
  - `GET /v1/whoami` with `Authorization: Bearer <IdP access token>` returns the linked internal `userId` and IdP `sub`.
  - `POST /v1/authorize` with the same header evaluates RBAC for the token user (or optional `sub` in the JSON body) and returns `{ "allowed": true | false }`. See `/openapi.json` or `/docs` for the full request schema.
  - When Ironclad signing env is configured, `POST /v1/token/exchange` mints an Ironclad JWT and `GET /.well-known/jwks.json` publishes verification keys (see **Token exchange** below).
  - When the process is started with a dedicated `listenSql` client, `GET /v1/events/invalidation` exposes **Server-Sent Events** with `auth_invalidate` payloads from Postgres `NOTIFY` (membership-related changes).

## Identity provider

The process entrypoint validates **OIDC access tokens** from your IdP (Auth0 by default) using **`IDP_ISSUER`**, **`IDP_AUDIENCE`**, and **`IDP_JWKS_URI`**. JWKS keys are re-fetched on a background interval in normal runtime (skipped under Vitest to avoid open handles).

Set the three `IDP_*` variables in `.env` (see `.env.example`). On first successful verification of a subject, a **`users`** row and **`provider_links`** row are created automatically.

## Token exchange

When **`IRONCLAD_ISSUER`**, **`IRONCLAD_TOKEN_AUDIENCE`**, and **`IRONCLAD_PRIVATE_KEY_PEM`** (PKCS#8 PEM for RS256) are set together (see `.env.example`), the server also:

- Publishes **`GET /.well-known/jwks.json`** for verifying minted tokens.
- Exposes **`POST /v1/token/exchange`** with the same **Bearer IdP** header as `/v1/whoami`. Send JSON (use `{}` if you have no overrides); optional `audience` and `expiresInSeconds` (60–86400). The response is `{ access_token, token_type: "Bearer", expires_in }` where `sub` is the internal user id and `idp_sub` carries the original IdP subject.

Omit all Ironclad signing variables to run without minting (default in CI and local dev).

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

## Issues

Use this repository’s **Issues** tab on GitHub to report bugs, request features, or suggest documentation updates. Choosing **New issue** offers templates under [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) (bug report, feature request, documentation). You can still open a blank issue if needed.

## License

This project is licensed under the **MIT License**; see **[LICENSE](./LICENSE)**.
