/**
 * Ensures Postgres is reachable for local/CI-agent workflows.
 * - If `DATABASE_URL` is set and connection fails, exits (does not start Docker).
 * - If unset, uses the URL matching `docker-compose.yml` and may run `docker compose up -d postgres`.
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const defaultUrl = "postgres://ironclad:ironclad@127.0.0.1:5432/ironclad_auth";

async function tryConnect(url: string): Promise<boolean> {
	const sql = postgres(url, { max: 1, connect_timeout: 3 });
	try {
		await sql`select 1`;
		await sql.end({ timeout: 2 });
		return true;
	} catch {
		try {
			await sql.end({ timeout: 1 });
		} catch {
			// ignore
		}
		return false;
	}
}

function dockerComposePostgresUp(): boolean {
	const r = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
		stdio: "inherit",
		cwd: process.cwd(),
		shell: false,
	});
	return r.status === 0;
}

async function main(): Promise<void> {
	const explicit = Boolean(process.env.DATABASE_URL?.trim());
	const url = process.env.DATABASE_URL?.trim() || defaultUrl;
	if (!explicit) {
		process.env.DATABASE_URL = url;
	}

	if (await tryConnect(url)) {
		console.log("Postgres is reachable.");
		return;
	}

	if (explicit) {
		console.error(
			`Cannot connect to DATABASE_URL. Fix the URL or start your database.`,
		);
		process.exit(1);
	}

	console.log(
		"Postgres not reachable; starting `docker compose up -d postgres`...",
	);
	if (!dockerComposePostgresUp()) {
		console.error(
			"Docker did not start Postgres. Install Docker, run compose manually, or set DATABASE_URL.",
		);
		process.exit(1);
	}

	for (let i = 0; i < 90; i++) {
		if (await tryConnect(url)) {
			console.log("Postgres is ready.");
			return;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	console.error("Timed out waiting for Postgres after docker compose.");
	process.exit(1);
}

void main();
