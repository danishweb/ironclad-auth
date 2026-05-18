import { expect, test } from "@playwright/test";
import { createLocalJWKSet, jwtVerify } from "jose";

const mockBase =
	process.env.E2E_MOCK_IDP_URL ??
	`http://127.0.0.1:${process.env.E2E_MOCK_IDP_PORT ?? "4010"}`;

async function mintIdpToken(sub?: string): Promise<string> {
	const res = await fetch(`${mockBase}/test/sign-token`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(sub ? { sub } : {}),
	});
	expect(res.ok).toBeTruthy();
	const body = (await res.json()) as { token?: string };
	expect(typeof body.token).toBe("string");
	return body.token as string;
}

test.describe("API smoke (live stack)", () => {
	test("GET /healthz", async ({ request }) => {
		const res = await request.get("/healthz");
		expect(res.ok()).toBeTruthy();
		expect(await res.json()).toEqual({ status: "ok" });
	});

	test("GET /v1/whoami with IdP bearer", async ({ request }) => {
		const token = await mintIdpToken();
		const res = await request.get("/v1/whoami", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { userId?: string; idpSub?: string };
		expect(body.idpSub).toBe("seed|admin-acme");
		expect(body.userId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
	});

	test("POST /v1/authorize allows seeded admin privilege", async ({
		request,
	}) => {
		const token = await mintIdpToken();
		const res = await request.post("/v1/authorize", {
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			data: {
				app: "billing",
				org: "acme-corp",
				privilege: "read:reports",
			},
		});
		expect(res.ok()).toBeTruthy();
		expect(await res.json()).toEqual({ allowed: true });
	});

	test("POST /v1/token/exchange returns verifiable JWT", async ({
		request,
	}) => {
		const token = await mintIdpToken();
		const ex = await request.post("/v1/token/exchange", {
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			data: {},
		});
		expect(ex.ok()).toBeTruthy();
		const body = (await ex.json()) as {
			token: string;
			expires_in: number;
			permissions: string[];
			orgs: string[];
		};
		expect(body.token.length).toBeGreaterThan(20);
		expect(body.orgs).toContain("acme-corp");
		expect(body.permissions.some((p) => p.includes("read:reports"))).toBe(true);

		const jwksRes = await request.get("/.well-known/jwks.json");
		expect(jwksRes.ok()).toBeTruthy();
		const jwks = (await jwksRes.json()) as { keys: Record<string, unknown>[] };
		const getKey = createLocalJWKSet(jwks);
		const ironcladIssuer =
			process.env.IRONCLAD_ISSUER ?? "https://ironclad.e2e.example/";
		const ironcladAudience =
			process.env.IRONCLAD_TOKEN_AUDIENCE ?? "https://resources.e2e.example/";
		const { payload } = await jwtVerify(body.token, getKey, {
			issuer: ironcladIssuer,
			audience: ironcladAudience,
		});
		expect(typeof payload.sub).toBe("string");
	});

	test("GET /v1/userinfo returns profile shape", async ({ request }) => {
		const token = await mintIdpToken();
		const res = await request.get("/v1/userinfo", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as {
			sub: string;
			idp_sub: string;
			orgs: string[];
			applications: Record<string, unknown>;
		};
		expect(body.idp_sub).toBe("seed|admin-acme");
		expect(body.orgs).toContain("acme-corp");
		expect(body.applications.billing).toBeTruthy();
	});
});
