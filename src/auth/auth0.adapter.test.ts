import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth0IdpAdapter } from "./auth0.adapter.js";

const issuer = "https://issuer.example/";
const audience = "https://api.example";

describe("createAuth0IdpAdapter", () => {
	let privateKey: CryptoKey;
	let adapter: ReturnType<typeof createAuth0IdpAdapter>;
	const kid = "unit-test-key";

	beforeAll(async () => {
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
	});

	async function signToken(options: { iss?: string; exp?: number } = {}) {
		const builder = new SignJWT({ email: "dev@example.com" })
			.setProtectedHeader({ alg: "RS256", kid })
			.setSubject("auth0|unit-user")
			.setIssuedAt()
			.setAudience(audience);
		builder.setIssuer(options.iss ?? issuer);
		if (options.exp !== undefined) {
			builder.setExpirationTime(options.exp);
		} else {
			builder.setExpirationTime("10m");
		}
		return builder.sign(privateKey);
	}

	it("accepts a valid access token", async () => {
		const token = await signToken();
		const claims = await adapter.verifyAccessToken(token);
		expect(claims.sub).toBe("auth0|unit-user");
		expect(claims.email).toBe("dev@example.com");
	});

	it("rejects expired tokens", async () => {
		const token = await signToken({
			exp: Math.floor(Date.now() / 1000) - 120,
		});
		await expect(adapter.verifyAccessToken(token)).rejects.toBeDefined();
	});

	it("rejects wrong issuer", async () => {
		const token = await signToken({ iss: "https://evil.example/" });
		await expect(adapter.verifyAccessToken(token)).rejects.toBeDefined();
	});
});
