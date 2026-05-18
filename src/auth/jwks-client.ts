import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

/**
 * Wraps {@link createRemoteJWKSet} and periodically replaces the resolver so JWKS rotations are picked up.
 */
export class JwksFetcher {
	private resolver: JWTVerifyGetKey;
	private timer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly jwksUrl: string,
		private readonly refreshMs = 900_000,
	) {
		this.resolver = createRemoteJWKSet(new URL(jwksUrl));
		if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
			return;
		}
		this.timer = setInterval(() => {
			this.resolver = createRemoteJWKSet(new URL(this.jwksUrl));
		}, this.refreshMs);
		this.timer.unref?.();
	}

	readonly getKey: JWTVerifyGetKey = (protectedHeader, token) => {
		return this.resolver(protectedHeader, token);
	};

	dispose(): void {
		if (this.timer) {
			clearInterval(this.timer);
		}
	}
}
