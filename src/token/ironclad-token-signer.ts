import { createPrivateKey, createPublicKey } from "node:crypto";
import { exportJWK, importPKCS8, importSPKI, SignJWT } from "jose";
import type { IroncladTokenEnv } from "./ironclad-token-env.js";

const alg = "RS256" as const;
const defaultTtlSeconds = 3600;
const maxTtlSeconds = 86_400;

export type IroncladTokenSigner = {
	readonly issuer: string;
	readonly defaultAudience: string;
	readonly defaultTtlSeconds: typeof defaultTtlSeconds;
	readonly maxTtlSeconds: typeof maxTtlSeconds;
	signAccessToken(input: {
		subject: string;
		audience: string;
		expiresInSeconds: number;
		idpSub?: string;
	}): Promise<string>;
	getPublicJwks(): { keys: Record<string, unknown>[] };
};

export async function createIroncladTokenSigner(
	env: IroncladTokenEnv,
): Promise<IroncladTokenSigner> {
	const privateKey = await importPKCS8(env.IRONCLAD_PRIVATE_KEY_PEM, alg);
	const nodePriv = createPrivateKey({
		key: env.IRONCLAD_PRIVATE_KEY_PEM,
		format: "pem",
	});
	const spki = createPublicKey(nodePriv).export({
		type: "spki",
		format: "pem",
	});
	const publicKey = await importSPKI(spki, alg);
	const jwk = { ...(await exportJWK(publicKey)) };
	jwk.kid = env.IRONCLAD_TOKEN_KID;
	jwk.use = "sig";
	jwk.alg = alg;

	return {
		issuer: env.IRONCLAD_ISSUER,
		defaultAudience: env.IRONCLAD_TOKEN_AUDIENCE,
		defaultTtlSeconds,
		maxTtlSeconds,
		async signAccessToken(input) {
			const now = Math.floor(Date.now() / 1000);
			const exp = now + input.expiresInSeconds;
			const claims: Record<string, string> = {};
			if (input.idpSub !== undefined && input.idpSub.length > 0) {
				claims.idp_sub = input.idpSub;
			}
			return await new SignJWT(claims)
				.setProtectedHeader({ alg, kid: env.IRONCLAD_TOKEN_KID })
				.setIssuer(env.IRONCLAD_ISSUER)
				.setSubject(input.subject)
				.setAudience(input.audience)
				.setIssuedAt(now)
				.setExpirationTime(exp)
				.sign(privateKey);
		},
		getPublicJwks() {
			return { keys: [jwk] };
		},
	};
}
