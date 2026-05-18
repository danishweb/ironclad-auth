import { createMiddleware } from "hono/factory";
import { errors } from "jose";
import type { IdentityProviderAdapter } from "../auth/idp.types.js";
import { type DbClient, resolveOrCreateUser } from "../auth/resolve-user.js";

export type IdpAuthVariables = {
	userId: string;
	idpSub: string;
};

export function createIdpAuthMiddleware(deps: {
	db: DbClient;
	idp: IdentityProviderAdapter;
}) {
	return createMiddleware<{ Variables: IdpAuthVariables }>(async (c, next) => {
		const header = c.req.header("Authorization");
		if (!header?.startsWith("Bearer ")) {
			return c.json({ error: "missing_bearer_token" }, 401);
		}
		const raw = header.slice("Bearer ".length).trim();
		if (raw.length === 0) {
			return c.json({ error: "missing_bearer_token" }, 401);
		}

		try {
			const claims = await deps.idp.verifyAccessToken(raw);
			const { userId } = await resolveOrCreateUser(
				deps.db,
				deps.idp.providerId,
				claims.sub,
				claims.email,
			);
			c.set("userId", userId);
			c.set("idpSub", claims.sub);
			await next();
		} catch (e) {
			if (e instanceof errors.JWTExpired) {
				return c.json({ error: "token_expired" }, 401);
			}
			if (e instanceof errors.JWTClaimValidationFailed) {
				return c.json({ error: "token_claim_invalid" }, 401);
			}
			if (e instanceof errors.JWSSignatureVerificationFailed) {
				return c.json({ error: "token_signature_invalid" }, 401);
			}
			return c.json({ error: "invalid_token" }, 401);
		}
	});
}
