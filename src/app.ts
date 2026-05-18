import { swaggerUI } from "@hono/swagger-ui";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { IdentityProviderAdapter } from "./auth/idp.types.js";
import type { DbClient } from "./auth/resolve-user.js";
import {
	createIdpAuthMiddleware,
	type IdpAuthVariables,
} from "./middleware/idp-auth.js";

export type CreateAppOptions = {
	db: DbClient;
	idp: IdentityProviderAdapter;
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

	if (deps?.db && deps?.idp) {
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
