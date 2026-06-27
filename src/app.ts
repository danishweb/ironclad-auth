import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { adminRouter } from "./admin.js";
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
import type { IroncladTokenSigner } from "./token/db-ironclad-token-signer.js";
import {
	buildUserinfoPayload,
	distinctOrgCodes,
	listUserPermissionRows,
	toQualifiedPermissionStrings,
} from "./token/user-permissions.js";

export type CreateAppOptions = {
	db: DbClient;
	idp: IdentityProviderAdapter;
	/** When set, exposes `GET /v1/events/invalidation` (SSE) backed by `LISTEN auth_invalidate`. */
	listenSql?: Sql;
	/** When set with `db` + `idp`, exposes token exchange, userinfo, and JWKS. */
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
		app.get("/.well-known/jwks.json", async (c) =>
			c.json(await ironcladJwks.getPublicJwks()),
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

		// Mount Admin API
		app.use("/v1/admin/*", async (c, next) => {
			c.set("db", deps.db as any);
			await next();
		});
		app.route("/v1/admin", adminRouter as any);

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
			const applicationsSchema = z.record(
				z.string(),
				z.record(z.string(), z.object({ privileges: z.array(z.string()) })),
			);
			const userinfoSchema = z.object({
				sub: z.string().uuid(),
				idp_sub: z.string(),
				orgs: z.array(z.string()),
				applications: applicationsSchema,
			});

			const userinfoRoute = createRoute({
				method: "get",
				path: "/v1/userinfo",
				tags: ["Token exchange"],
				summary: "User profile and effective permissions",
				description:
					"Returns the internal user id, IdP subject, distinct org codes, and privileges grouped by application and organization.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: "User info",
						content: {
							"application/json": {
								schema: userinfoSchema,
							},
						},
					},
				},
			});

			app.openapi(userinfoRoute, async (c) => {
				const rows = await listUserPermissionRows(deps.db, c.get("userId"));
				return c.json(
					buildUserinfoPayload(rows, {
						sub: c.get("userId"),
						idpSub: c.get("idpSub"),
					}),
				);
			});

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
				summary: "Exchange IdP token for an Ironclad-enriched access token",
				description:
					"Accepts the same Bearer IdP token as other `/v1/*` routes. Returns a short-lived RS256 JWT (`token`) whose claims include `permissions` and `orgs`, plus the same arrays in the JSON body for convenience. Verify the JWT with `GET /.well-known/jwks.json`.",
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
						description: "Issued enriched token",
						content: {
							"application/json": {
								schema: z.object({
									token: z.string(),
									expires_in: z.number().int(),
									permissions: z.array(z.string()),
									orgs: z.array(z.string()),
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
				const rows = await listUserPermissionRows(deps.db, c.get("userId"));
				const permissions = toQualifiedPermissionStrings(rows);
				const orgs = distinctOrgCodes(rows);
				const token = await t.signEnrichedToken({
					subject: c.get("userId"),
					audience,
					expiresInSeconds: ttl,
					idpSub: c.get("idpSub"),
					permissions,
					orgs,
				});
				return c.json({
					token,
					expires_in: ttl,
					permissions,
					orgs,
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
