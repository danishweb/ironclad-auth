import { randomUUID } from "node:crypto";
import {
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	jwtVerify,
	SignJWT,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createAuth0IdpAdapter } from "../auth/auth0.adapter.js";
import type { DbClient } from "../auth/resolve-user.js";
import { createDbIroncladTokenSigner } from "./db-ironclad-token-signer.js";
import { loadIroncladTokenConfig } from "./ironclad-token-config.js";
import { ensureActiveSigningKey } from "./signing-keys.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("token exchange + userinfo (database)", () => {
	let db: DbClient;
	const issuer = "https://issuer.example/";
	const audience = "https://api.example";
	const kid = "phase4-int-key";
	let privateKey: CryptoKey;
	let adapter: ReturnType<typeof createAuth0IdpAdapter>;
	let ironcladToken: Awaited<ReturnType<typeof createDbIroncladTokenSigner>>;
	let validToken: string;
	let expiredToken: string;

	beforeAll(async () => {
		process.env.KEY_ENCRYPTION_SECRET =
			process.env.KEY_ENCRYPTION_SECRET ?? "integration-test-secret-key-16+";
		process.env.IRONCLAD_ISSUER =
			process.env.IRONCLAD_ISSUER ?? "https://ironclad.integration.example/";
		process.env.IRONCLAD_TOKEN_AUDIENCE =
			process.env.IRONCLAD_TOKEN_AUDIENCE ??
			"https://resources.integration.example/";

		({ db } = await import("../db/client.js"));

		const pair = await generateKeyPair("RS256", { modulusLength: 2048 });
		privateKey = pair.privateKey;
		const jwk = {
			...(await exportJWK(pair.publicKey)),
			kid,
			use: "sig",
			alg: "RS256",
		};
		const getKey = createLocalJWKSet({ keys: [jwk] });
		adapter = createAuth0IdpAdapter({ issuer, audience, getKey });

		const cfg = loadIroncladTokenConfig();
		if (!cfg) {
			throw new Error("expected ironclad token config after env defaults");
		}
		await ensureActiveSigningKey(db, cfg.KEY_ENCRYPTION_SECRET);
		ironcladToken = await createDbIroncladTokenSigner(db, {
			issuer: cfg.IRONCLAD_ISSUER,
			defaultAudience: cfg.IRONCLAD_TOKEN_AUDIENCE,
			keyEncryptionSecret: cfg.KEY_ENCRYPTION_SECRET,
		});

		const sub = "seed|admin-acme";
		const now = Math.floor(Date.now() / 1000);
		validToken = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(issuer)
			.setAudience(audience)
			.setSubject(sub)
			.setIssuedAt(now - 60)
			.setExpirationTime(now + 900)
			.sign(privateKey);

		expiredToken = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(issuer)
			.setAudience(audience)
			.setSubject(sub)
			.setIssuedAt(now - 3600)
			.setExpirationTime(now - 120)
			.sign(privateKey);
	});

	it("serves JWKS with active signing key metadata", async () => {
		const app = createApp({ db, idp: adapter, ironcladToken });
		const res = await app.request("/.well-known/jwks.json");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { keys: Record<string, unknown>[] };
		expect(Array.isArray(body.keys)).toBe(true);
		expect(body.keys.length).toBeGreaterThan(0);
		const k0 = body.keys[0];
		expect(k0?.kid).toBeTruthy();
		expect(k0?.kty).toBe("RSA");
	});

	it("returns 401 from token exchange when IdP token is expired", async () => {
		const app = createApp({ db, idp: adapter, ironcladToken });
		const res = await app.request("/v1/token/exchange", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${expiredToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
	});

	it("exchanges a valid IdP token for enriched token + userinfo (seed RBAC)", async () => {
		const app = createApp({ db, idp: adapter, ironcladToken });
		const ex = await app.request("/v1/token/exchange", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${validToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		expect(ex.status).toBe(200);
		const body = (await ex.json()) as {
			token: string;
			expires_in: number;
			permissions: string[];
			orgs: string[];
		};
		expect(body.token.length).toBeGreaterThan(10);
		expect(body.expires_in).toBe(300);
		expect(body.orgs).toContain("acme-corp");
		expect(body.permissions.some((p) => p.includes("read:reports"))).toBe(true);

		const jwks = createLocalJWKSet(await ironcladToken.getPublicJwks());
		const { payload } = await jwtVerify(body.token, jwks, {
			issuer: ironcladToken.issuer,
			audience: ironcladToken.defaultAudience,
		});
		expect(Array.isArray(payload.permissions)).toBe(true);
		expect(Array.isArray(payload.orgs)).toBe(true);
		expect(payload.jti).toBeTruthy();

		const ui = await app.request("/v1/userinfo", {
			headers: { Authorization: `Bearer ${validToken}` },
		});
		expect(ui.status).toBe(200);
		const info = (await ui.json()) as {
			sub: string;
			idp_sub: string;
			orgs: string[];
			applications: Record<string, Record<string, { privileges: string[] }>>;
		};
		expect(info.idp_sub).toBe("seed|admin-acme");
		expect(info.applications.billing?.["acme-corp"]?.privileges).toContain(
			"read:reports",
		);
	});

	it("rejects random bearer on userinfo", async () => {
		const app = createApp({ db, idp: adapter, ironcladToken });
		const res = await app.request("/v1/userinfo", {
			headers: { Authorization: `Bearer ${randomUUID()}` },
		});
		expect(res.status).toBe(401);
	});
});
