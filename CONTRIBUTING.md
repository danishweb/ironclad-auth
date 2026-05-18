# Contributing

Thanks for helping improve ironclad-auth. This document explains how to work on the repo and how maintainers should lock down `main`.

## Prerequisites

- **Node.js 22+** (see `engines` in `package.json`)
- **pnpm** (version pinned via `packageManager` — enable with `corepack enable`)
- **Postgres 16+** for migrations, seeds, and integration tests (or `docker compose up -d postgres`)

## Getting started

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres   # optional; point DATABASE_URL at your instance
pnpm db:migrate
pnpm db:seed                      # optional demo data
pnpm dev                          # needs IDP_* vars for the full server (see README)
```

Before opening a PR, run:

```bash
pnpm lint
pnpm build
pnpm test
```

Integration tests that need Postgres + migrations are skipped when `DATABASE_URL` is unset; CI always runs them against the service container.

## Pull requests

- Open PRs against **`main`** from a **feature branch** (for example `feat/…`, `fix/…`, or `chore/…`).
- Keep changes focused; match existing style (Biome formatting, TypeScript strict mode, casual short commit titles without bodies unless needed).
- Fill in the PR template checklist.
- Do **not** paste proprietary or private planning content into public PRs; summarize in your own words if you need design context.

## Maintainer setup: protect `main`

GitHub cannot learn branch protection from a file in this repository. A **repo admin** must configure it in the GitHub UI (or org policy).

### Recommended: classic branch protection

1. Open the repo on GitHub → **Settings** → **Branches**.
2. **Add branch protection rule** (or edit an existing one) with branch name pattern **`main`**.
3. Enable at least:
   - **Require a pull request before merging** (set minimum approvals to `1` when the team is large enough).
   - **Require status checks to pass before merging** → search the list for the CI job named **`lint-test`** from the workflow **`ci`**, and require it. After the next CI run on a PR, the check appears in the picker.
   - **Require conversation resolution before merging** (optional but useful for review threads).
   - **Require linear history** (optional; keeps history easy to bisect).
4. Under **Rules applied to everyone including administrators**: enable **Do not allow bypassing the above settings** if you want the same rules for admins.
5. Enable **Do not allow force pushes** and **Do not allow deletions** for `main`.

### Alternative: repository rulesets

**Settings** → **Rules** → **Rulesets** → **New ruleset** → target **`main`**, then enable **Block direct pushes**, **Require a pull request before merging**, **Require status checks**, and **Block force pushes**. Rulesets are GitHub’s newer model and are easier to extend across repos in an organization.

### Why this matters

- **No direct pushes to `main`** ensures every change goes through PR + CI + review.
- **Required checks** mean `pnpm lint`, `pnpm build`, `pnpm test`, and database steps in CI must pass before merge.

If something in this guide is unclear, open a PR to improve this file.
