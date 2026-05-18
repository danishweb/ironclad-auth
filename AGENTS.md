# Agent workflow

This repo is set up so an automated agent can validate changes **without a human clicking through a browser**, using the same checks CI runs.

## One command (recommended)

From the repository root, with Docker available (for Postgres):

```bash
pnpm install
pnpm verify:agent
```

`verify:agent` will:

1. Ensure Postgres is up (`docker compose up -d postgres` when `DATABASE_URL` is not set, using the default URL that matches `docker-compose.yml`).
2. Run migrations and seed data.
3. Install the Playwright Chromium browser if needed.
4. Run lint, TypeScript build, Vitest, and Playwright API + smoke tests (including a live stack with a local mock IdP).

If you already have Postgres elsewhere, set `DATABASE_URL` first; the script will **not** start Docker in that case.

## Individual steps

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Biome |
| `pnpm build` | `tsc` |
| `pnpm test` | Vitest |
| `pnpm e2e` | Playwright (expects DB + built `dist/`; stack is started by Playwright `webServer`) |
| `pnpm e2e:install` | Download Chromium for Playwright |
| `pnpm db:ensure` | Only ensure Postgres (Docker or existing URL) |

## CI parity

GitHub Actions runs migrate, seed, lint, build, test, Playwright browser install, then `pnpm e2e`. Matching that locally is `pnpm verify:agent` (or the same sequence manually).

## Optional faster iteration

- Reuse an already-running stack: set `PLAYWRIGHT_REUSE=1` when running `pnpm e2e` (see `playwright.config.ts`).
- Skip Docker: provide `DATABASE_URL` to your own Postgres instance.

## Windows and shells

`pnpm verify:agent` uses `sh` for a default `DATABASE_URL`. Use Git Bash, WSL, or run the same commands manually in an environment where `sh` and `docker compose` are available.
