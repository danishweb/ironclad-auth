import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

export const app = new OpenAPIHono();

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

app.doc("/openapi.json", {
	openapi: "3.1.0",
	info: {
		title: "ironclad-auth",
		version: "0.0.0",
	},
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));
