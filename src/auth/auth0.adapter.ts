import { type JWTVerifyGetKey, jwtVerify } from "jose";
import type {
	IdentityProviderAdapter,
	VerifiedIdpClaims,
} from "./idp.types.js";

export function createAuth0IdpAdapter(options: {
	issuer: string;
	audience: string;
	getKey: JWTVerifyGetKey;
}): IdentityProviderAdapter {
	return {
		providerId: "auth0",
		async verifyAccessToken(token: string): Promise<VerifiedIdpClaims> {
			const { payload } = await jwtVerify(token, options.getKey, {
				issuer: options.issuer,
				audience: options.audience,
			});
			if (typeof payload.sub !== "string" || payload.sub.length === 0) {
				throw new Error("IdP token missing sub");
			}
			const email =
				typeof payload.email === "string" && payload.email.length > 0
					? payload.email
					: undefined;
			return { sub: payload.sub, email };
		},
	};
}
