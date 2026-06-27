import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createAuth0IdpAdapter } from "./auth0.adapter.js";
import type { DbClient } from "./resolve-user.js";
import { resolveOrCreateUser } from "./resolve-user.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("IdP integration (database)", () => {
	let db: DbClient;
	const issuer = "https://issuer.example/";
	const audience = "https://api.example";
	const kid = "flow-test-key";
	let privateKey: CryptoKey;
	let token: string;
	let adapter: ReturnType<typeof createAuth0IdpAdapter>;

	beforeAll(async () => {
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

		const sub = `auth0|${randomUUID()}`;
		token = await new SignJWT({ email: "whoami@example.com" })
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(issuer)
			.setAudience(audience)
			.setSubject(sub)
			.setIssuedAt()
			.setExpirationTime("10m")
			.sign(privateKey);
	});

	it("creates then reuses a user for the same IdP subject", async () => {
		const sub = `auth0|${randomUUID()}`;
		const email = `flow-${randomUUID()}@example.com`;
		const first = await resolveOrCreateUser(
			db,
			"auth0",
			sub,
			email,
		);
		const second = await resolveOrCreateUser(
			db,
			"auth0",
			sub,
			email,
		);
		expect(second.userId).toBe(first.userId);
	});

	it("returns 401 from whoami without Authorization header", async () => {
		const app = createApp({ db, idp: adapter });
		const res = await app.request("/v1/whoami");
		expect(res.status).toBe(401);
	});

	it("returns user mapping from whoami with a valid bearer token", async () => {
		const app = createApp({ db, idp: adapter });
		const uniqueSub = `auth0|${randomUUID()}`;
		const uniqueEmail = `whoami-${randomUUID()}@example.com`;
		const uniqueToken = await new SignJWT({ email: uniqueEmail })
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(issuer)
			.setAudience(audience)
			.setSubject(uniqueSub)
			.setIssuedAt()
			.setExpirationTime("10m")
			.sign(privateKey);

		const res = await app.request("/v1/whoami", {
			headers: { Authorization: `Bearer ${uniqueToken}` },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; idpSub: string };
		expect(body.idpSub).toBe(uniqueSub);
		expect(body.userId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
	});
});

