import { execSync, spawn } from "node:child_process";
import process from "node:process";
import { startMockIdp } from "./mock-idp.js";

const MOCK_PORT = Number(process.env.E2E_MOCK_IDP_PORT ?? "4010");
const APP_PORT = Number(process.env.PORT ?? "3000");

if (!process.env.DATABASE_URL?.trim()) {
	console.error(
		"e2e/run-stack: DATABASE_URL must be set (same as db:migrate / db:seed).",
	);
	process.exit(1);
}

process.env.E2E_MINT_TOKENS = "1";

const mock = await startMockIdp(MOCK_PORT);
const cwd = process.cwd();

const skipDbPrep = process.env.E2E_SKIP_DB_PREP === "1";
if (skipDbPrep) {
	console.log("e2e/run-stack: skipping migrate/seed (E2E_SKIP_DB_PREP=1)");
} else {
	execSync("pnpm db:migrate", { stdio: "inherit", cwd, env: process.env });
	execSync("pnpm db:seed", { stdio: "inherit", cwd, env: process.env });
}

const appEnv: NodeJS.ProcessEnv = {
	...process.env,
	PORT: String(APP_PORT),
	E2E_MINT_TOKENS: "1",
	IDP_ISSUER: mock.issuer,
	IDP_AUDIENCE: mock.audience,
	IDP_JWKS_URI: mock.jwksUri,
	KEY_ENCRYPTION_SECRET:
		process.env.KEY_ENCRYPTION_SECRET ?? "e2e-key-encryption-secret-16+",
	IRONCLAD_ISSUER:
		process.env.IRONCLAD_ISSUER ?? "https://ironclad.e2e.example/",
	IRONCLAD_TOKEN_AUDIENCE:
		process.env.IRONCLAD_TOKEN_AUDIENCE ?? "https://resources.e2e.example/",
};

const child = spawn("node", ["dist/index.js"], {
	cwd,
	env: appEnv,
	stdio: "inherit",
});

let mockStopped = false;
let shuttingDown = false;

async function stopMock() {
	if (mockStopped) {
		return;
	}
	mockStopped = true;
	await mock.stop().catch(() => {});
}

async function shutdown(signal: NodeJS.Signals) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	try {
		child.kill(signal);
	} catch {
		// ignore
	}
	await stopMock();
	process.exit(0);
}

process.on("SIGTERM", () => {
	void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
	void shutdown("SIGINT");
});

child.on("exit", (code, sig) => {
	void stopMock().finally(() => {
		if (shuttingDown) {
			process.exit(0);
		}
		process.exit(code ?? (sig ? 1 : 0));
	});
});
