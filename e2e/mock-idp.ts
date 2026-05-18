import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const KID = "e2e-mock-key";

export type MockIdp = {
	readonly issuer: string;
	readonly audience: string;
	readonly jwksUri: string;
	stop: () => Promise<void>;
};

/**
 * Minimal RS256 issuer + JWKS for local E2E. When `process.env.E2E_MINT_TOKENS === "1"`,
 * exposes `POST /test/sign-token` with JSON body `{ "sub"?: string }` (default `seed|admin-acme`).
 */
export async function startMockIdp(port: number): Promise<MockIdp> {
	const pair = await generateKeyPair("RS256", { modulusLength: 2048 });
	const publicJwk = {
		...(await exportJWK(pair.publicKey)),
		kid: KID,
		use: "sig",
		alg: "RS256",
	};
	const jwksBody = JSON.stringify({ keys: [publicJwk] });
	const issuer = `http://127.0.0.1:${port}/`;
	const audience = "e2e-api-audience";

	const signAccessToken = async (sub: string) => {
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: KID })
			.setIssuer(issuer)
			.setAudience(audience)
			.setSubject(sub)
			.setIssuedAt(now - 60)
			.setExpirationTime(now + 3600)
			.sign(pair.privateKey);
	};

	const server = createServer((req, res) => {
		const host = `127.0.0.1:${port}`;
		const url = new URL(req.url ?? "/", `http://${host}`);

		if (req.method === "GET" && url.pathname === "/jwks.json") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(jwksBody);
			return;
		}

		if (
			process.env.E2E_MINT_TOKENS === "1" &&
			req.method === "POST" &&
			url.pathname === "/test/sign-token"
		) {
			const chunks: Buffer[] = [];
			req.on("data", (c) => {
				chunks.push(c as Buffer);
			});
			req.on("end", () => {
				let sub = "seed|admin-acme";
				if (chunks.length > 0) {
					try {
						const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
							sub?: string;
						};
						if (typeof body.sub === "string" && body.sub.length > 0) {
							sub = body.sub;
						}
					} catch {
						// keep default sub
					}
				}
				void signAccessToken(sub).then(
					(token) => {
						res.writeHead(200, { "content-type": "application/json" });
						res.end(JSON.stringify({ token }));
					},
					() => {
						res.writeHead(500);
						res.end();
					},
				);
			});
			return;
		}

		res.writeHead(404);
		res.end();
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => resolve());
	});

	return {
		issuer,
		audience,
		jwksUri: `http://127.0.0.1:${port}/jwks.json`,
		stop: () =>
			new Promise((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve(undefined)));
			}),
	};
}
