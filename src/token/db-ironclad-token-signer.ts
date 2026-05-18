import { randomUUID } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { DbClient } from "../auth/resolve-user.js";
import { decryptEnvelope } from "./key-envelope.js";
import {
	loadActivePublicJwks,
	loadActiveSigningKeyForSign,
} from "./signing-keys.js";

const alg = "RS256" as const;

export type IroncladTokenSigner = {
	readonly issuer: string;
	readonly defaultAudience: string;
	readonly defaultTtlSeconds: number;
	readonly maxTtlSeconds: number;
	signEnrichedToken(input: {
		subject: string;
		audience: string;
		expiresInSeconds: number;
		idpSub?: string;
		permissions: string[];
		orgs: string[];
	}): Promise<string>;
	getPublicJwks(): Promise<{ keys: Record<string, unknown>[] }>;
};

export async function createDbIroncladTokenSigner(
	db: DbClient,
	config: {
		issuer: string;
		defaultAudience: string;
		keyEncryptionSecret: string;
	},
): Promise<IroncladTokenSigner> {
	const defaultTtlSeconds = 300;
	const maxTtlSeconds = 3600;

	return {
		issuer: config.issuer,
		defaultAudience: config.defaultAudience,
		defaultTtlSeconds,
		maxTtlSeconds,
		async signEnrichedToken(input) {
			const active = await loadActiveSigningKeyForSign(db);
			if (!active) {
				throw new Error("no active signing key");
			}
			const pem = decryptEnvelope(
				config.keyEncryptionSecret,
				active.privateKeyEnc,
			);
			const privateKey = await importPKCS8(pem, alg);
			const now = Math.floor(Date.now() / 1000);
			const exp = now + input.expiresInSeconds;
			const jti = randomUUID();
			const claims: Record<string, unknown> = {
				permissions: input.permissions,
				orgs: input.orgs,
			};
			if (input.idpSub !== undefined && input.idpSub.length > 0) {
				claims.idp_sub = input.idpSub;
			}
			return await new SignJWT(claims)
				.setProtectedHeader({ alg, kid: active.kid })
				.setIssuer(config.issuer)
				.setSubject(input.subject)
				.setAudience(input.audience)
				.setIssuedAt(now)
				.setExpirationTime(exp)
				.setJti(jti)
				.sign(privateKey);
		},
		async getPublicJwks() {
			return loadActivePublicJwks(db);
		},
	};
}
