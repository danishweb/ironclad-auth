import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("healthz", () => {
	it("returns ok", async () => {
		const res = await app.request("/healthz");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
		expect(await res.json()).toEqual({ status: "ok" });
	});
});

describe("openapi", () => {
	it("serves spec", async () => {
		const res = await app.request("/openapi.json");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			openapi?: string;
			paths?: Record<string, unknown>;
		};
		expect(body.openapi).toBe("3.1.0");
		expect(body.paths).toHaveProperty("/healthz");
	});
});

describe("docs", () => {
	it("serves swagger ui", async () => {
		const res = await app.request("/docs");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("swagger");
	});
});
