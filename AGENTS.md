# Agent workflow

Automated agents (and humans) should validate work the same way **GitHub Actions** does: one scripted path, no tribal knowledge.

## Contract

The source of truth is **`.github/workflows/ci.yml`** — `pnpm run ci:core` mirrors that job’s check steps (migrate → seed → lint → build → test → Playwright browser install → E2E). Environment defaults for `DATABASE_URL`, `KEY_ENCRYPTION_SECRET`, and `IRONCLAD_*` match the workflow when unset.

E2E starts the app via Playwright `webServer`. When **`E2E_SKIP_DB_PREP=1`** (set automatically inside `ci:core` and on the CI `pnpm e2e` step), **`e2e/run-stack.ts` does not run migrate/seed again** — the database was already prepared in the same pipeline.

If you run **`pnpm e2e` alone** (without `ci:core`), migrate/seed still run inside `run-stack` so a quick E2E loop works without a separate DB step.

## One command (recommended)

From the repository root, with Docker available if you rely on the default `DATABASE_URL`:

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs **`pnpm db:ensure`** (start `docker compose` Postgres when `DATABASE_URL` is unset, matching `docker-compose.yml`) and then **`pnpm run ci:core`**.

`pnpm verify:agent` is an alias for **`pnpm verify`**.

## Individual commands

| Command | Purpose |
| --- | --- |
| `pnpm run ci:core` | Full CI check sequence; requires Postgres reachable (does not run `db:ensure`) |
| `pnpm db:ensure` | Ensure Postgres via Docker when `DATABASE_URL` is unset |
| `pnpm lint` | Biome |
| `pnpm build` | `tsc` |
| `pnpm test` | Vitest |
| `pnpm e2e` | Playwright (starts stack via `webServer`; runs migrate/seed unless `E2E_SKIP_DB_PREP=1`) |
| `pnpm e2e:install` | `playwright install chromium --with-deps` only |

## Optional faster iteration

- Reuse an already-running stack: **`PLAYWRIGHT_REUSE=1`** when running `pnpm e2e` (see `playwright.config.ts`).
- Use your own Postgres: set **`DATABASE_URL`**; `db:ensure` will not start Docker.

## Windows and shells

`ci:core` uses **`sh`**. Use Git Bash, WSL, or run the same commands from `.github/workflows/ci.yml` manually in your shell.
