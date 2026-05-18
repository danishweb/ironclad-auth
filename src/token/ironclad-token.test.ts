import { generateKeyPairSync } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createIroncladTokenSigner } from "./ironclad-token-signer.js";

describe("createIroncladTokenSigner", () => {
	it("mints a JWT verifiable via published JWKS", async () => {
		const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
		const pem = privateKey.export({ type: "pkcs8", format: "pem" });
		if (typeof pem !== "string") {
			throw new Error("expected PEM string");
		}
		const signer = await createIroncladTokenSigner({
			IRONCLAD_ISSUER: "https://ironclad.example/",
			IRONCLAD_TOKEN_AUDIENCE: "https://api.example/",
			IRONCLAD_PRIVATE_KEY_PEM: pem,
			IRONCLAD_TOKEN_KID: "test-kid",
		});
		const token = await signer.signAccessToken({
			subject: "550e8400-e29b-41d4-a716-446655440000",
			audience: signer.defaultAudience,
			expiresInSeconds: 600,
			idpSub: "auth0|abc",
		});
		const jwks = createLocalJWKSet(signer.getPublicJwks());
		const { payload } = await jwtVerify(token, jwks, {
			issuer: signer.issuer,
			audience: signer.defaultAudience,
		});
		expect(payload.sub).toBe("550e8400-e29b-41d4-a716-446655440000");
		expect(payload.idp_sub).toBe("auth0|abc");
	});
});
