import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import type { Sql } from "postgres";
import type { IdentityProviderAdapter } from "./auth/idp.types.js";
import type { DbClient } from "./auth/resolve-user.js";
import { createAuthInvalidateHub } from "./authorization/auth-invalidate-hub.js";
import {
	evaluateAuthorization,
	resolvePrincipalUserId,
} from "./authorization/evaluate-authorization.js";
import {
	createIdpAuthMiddleware,
	type IdpAuthVariables,
} from "./middleware/idp-auth.js";
import type { IroncladTokenSigner } from "./token/ironclad-token-signer.js";

export type CreateAppOptions = {
	db: DbClient;
	idp: IdentityProviderAdapter;
	/** When set, exposes `GET /v1/events/invalidation` (SSE) backed by `LISTEN auth_invalidate`. */
	listenSql?: Sql;
	/** When set with `db` + `idp`, exposes `POST /v1/token/exchange` and `GET /.well-known/jwks.json`. */
	ironcladToken?: IroncladTokenSigner;
};

export function createApp(deps?: CreateAppOptions) {
	const app = new OpenAPIHono<{ Variables: IdpAuthVariables }>();

	const healthzRoute = createRoute({
		method: "get",
		path: "/healthz",
		tags: ["Health"],
		responses: {
			200: {
				description: "Liveness",
				content: {
					"application/json": {
						schema: z.object({ status: z.literal("ok") }),
					},
				},
			},
		},
	});

	app.openapi(healthzRoute, (c) => c.json({ status: "ok" }));

	if (deps?.ironcladToken) {
		const ironcladJwks = deps.ironcladToken;
		app.get("/.well-known/jwks.json", (c) =>
			c.json(ironcladJwks.getPublicJwks()),
		);
	}

	if (deps?.db && deps?.idp) {
		const authInvalidateHub = deps.listenSql
			? createAuthInvalidateHub(deps.listenSql)
			: undefined;

		app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
			type: "http",
			scheme: "bearer",
			bearerFormat: "JWT",
		});

		app.use("/v1/*", createIdpAuthMiddleware({ db: deps.db, idp: deps.idp }));

		const whoamiRoute = createRoute({
			method: "get",
			path: "/v1/whoami",
			tags: ["Identity"],
			summary: "Resolve IdP bearer token to internal user",
			security: [{ bearerAuth: [] }],
			responses: {
				200: {
					description: "Linked internal user",
					content: {
						"application/json": {
							schema: z.object({
								userId: z.string().uuid(),
								idpSub: z.string(),
							}),
						},
					},
				},
			},
		});

		app.openapi(whoamiRoute, (c) =>
			c.json({ userId: c.get("userId"), idpSub: c.get("idpSub") }),
		);

		const authorizeBody = z
			.object({
				sub: z.string().optional(),
				app: z.string().min(1),
				org: z.string().min(1),
				privilege: z.string().min(1),
				orgUnits: z.array(z.string().min(1)).optional(),
				anyOrgUnit: z.boolean().optional(),
				actingRole: z.string().min(1).optional(),
				viewAsPrivilege: z.string().min(1).optional(),
			})
			.openapi({
				example: {
					app: "billing",
					org: "acme-corp",
					privilege: "read:reports",
				},
			});

		const authorizeRoute = createRoute({
			method: "post",
			path: "/v1/authorize",
			tags: ["Authorization"],
			summary: "Evaluate whether a principal is allowed a privilege",
			security: [{ bearerAuth: [] }],
			request: {
				body: {
					content: {
						"application/json": {
							schema: authorizeBody,
						},
					},
					required: true,
				},
			},
			responses: {
				200: {
					description: "Authorization decision",
					content: {
						"application/json": {
							schema: z.object({ allowed: z.boolean() }),
						},
					},
				},
			},
		});

		app.openapi(authorizeRoute, async (c) => {
			const body = c.req.valid("json");
			let principalUserId: string;
			const sub = body.sub?.trim();
			if (sub) {
				const id = await resolvePrincipalUserId(
					deps.db,
					sub,
					deps.idp.providerId,
				);
				if (!id) {
					return c.json({ allowed: false });
				}
				principalUserId = id;
			} else {
				principalUserId = c.get("userId");
			}

			const allowed = await evaluateAuthorization(deps.db, {
				principalUserId,
				app: body.app,
				org: body.org,
				privilege: body.privilege,
				orgUnits: body.orgUnits,
				anyOrgUnitAuthorized: body.anyOrgUnit,
				actingRole: body.actingRole,
				viewAsPrivilege: body.viewAsPrivilege,
			});
			return c.json({ allowed });
		});

		if (deps.ironcladToken) {
			const t = deps.ironcladToken;
			const tokenExchangeBody = z.object({
				audience: z.string().min(1).optional(),
				expiresInSeconds: z
					.number()
					.int()
					.min(60)
					.max(t.maxTtlSeconds)
					.optional(),
			});

			const tokenExchangeRoute = createRoute({
				method: "post",
				path: "/v1/token/exchange",
				tags: ["Token exchange"],
				summary: "Mint an Ironclad-signed JWT from a valid IdP access token",
				description:
					"Accepts the same Bearer IdP token as other `/v1/*` routes. Returns a JWT whose `sub` is the internal user id; verify it with `GET /.well-known/jwks.json`.",
				security: [{ bearerAuth: [] }],
				request: {
					body: {
						content: {
							"application/json": {
								schema: tokenExchangeBody,
							},
						},
						required: true,
					},
				},
				responses: {
					200: {
						description: "Issued access token",
						content: {
							"application/json": {
								schema: z.object({
									access_token: z.string(),
									token_type: z.literal("Bearer"),
									expires_in: z.number().int(),
								}),
							},
						},
					},
				},
			});

			app.openapi(tokenExchangeRoute, async (c) => {
				const body = c.req.valid("json");
				const audience =
					body.audience !== undefined && body.audience.trim().length > 0
						? body.audience.trim()
						: t.defaultAudience;
				const ttl =
					body.expiresInSeconds !== undefined
						? body.expiresInSeconds
						: t.defaultTtlSeconds;
				const access_token = await t.signAccessToken({
					subject: c.get("userId"),
					audience,
					expiresInSeconds: ttl,
					idpSub: c.get("idpSub"),
				});
				return c.json({
					access_token,
					token_type: "Bearer" as const,
					expires_in: ttl,
				});
			});
		}

		if (authInvalidateHub) {
			app.get("/v1/events/invalidation", (c) =>
				streamSSE(c, async (stream) => {
					await authInvalidateHub.waitUntilReady();
					await stream.writeSSE({ event: "ready", data: "{}" });
					const unsubscribe = authInvalidateHub.subscribe((payload) => {
						void stream.writeSSE({
							event: "auth_invalidate",
							data: payload,
						});
					});
					await new Promise<void>((resolve) => {
						stream.onAbort(() => {
							unsubscribe();
							resolve();
						});
					});
				}),
			);
		}
	}

	app.doc("/openapi.json", {
		openapi: "3.1.0",
		info: {
			title: "ironclad-auth",
			version: "0.0.0",
		},
	});

	app.get("/docs", swaggerUI({ url: "/openapi.json" }));

	return app;
}
