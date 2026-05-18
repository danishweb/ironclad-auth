import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createAuth0IdpAdapter } from "../auth/auth0.adapter.js";
import type { DbClient } from "../auth/resolve-user.js";
import { createAuthInvalidateHub } from "./auth-invalidate-hub.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("authorization (database)", () => {
	let db: DbClient;
	let sql: Awaited<typeof import("../db/client.js")>["sql"];
	let listenSql: Awaited<typeof import("../db/client.js")>["listenSql"];
	const issuer = "https://issuer.example/";
	const audience = "https://api.example";
	const kid = "authz-test-key";
	let privateKey: CryptoKey;
	let adapter: ReturnType<typeof createAuth0IdpAdapter>;
	let token: string;
	let idpSub: string;

	const suffix = randomUUID().slice(0, 8);
	const orgCode = `org-${suffix}`;
	const appCode = `app-${suffix}`;

	beforeAll(async () => {
		({ db, sql, listenSql } = await import("../db/client.js"));
		const pair = await generateKeyPair("RS256", { modulusLength: 2048 });
		privateKey = pair.privateKey;
		const jwk = {
			...(await exportJWK(pair.publicKey)),
			kid,
			use: "sig",
			alg: "RS256",
		};
		const getKey = createLocalJWKSet({ keys: [jwk] });
		adapter = createAuth0IdpAdapter({ issuer, audience, getKey });

		idpSub = `auth0|authz-${suffix}`;
		token = await new SignJWT({ email: `authz-${suffix}@example.com` })
			.setProtectedHeader({ alg: "RS256", kid })
			.setIssuer(issuer)
			.setAudience(audience)
			.setSubject(idpSub)
			.setIssuedAt()
			.setExpirationTime("30m")
			.sign(privateKey);

		const { eq } = await import("drizzle-orm");
		const schema = await import("../db/schema.js");

		const [org] = await db
			.insert(schema.orgs)
			.values({ code: orgCode, name: "Authz Org", status: "active" })
			.returning();
		if (!org) {
			throw new Error("org insert failed");
		}
		const [app] = await db
			.insert(schema.apps)
			.values({ code: appCode, name: "Authz App", status: "active" })
			.returning();
		if (!app) {
			throw new Error("app insert failed");
		}
		const [appOrg] = await db
			.insert(schema.appsOrgs)
			.values({ appId: app.id, orgId: org.id, status: "active" })
			.returning();
		if (!appOrg) {
			throw new Error("apps_orgs insert failed");
		}

		const [memberRole] = await db
			.insert(schema.roles)
			.values({
				appId: app.id,
				code: "member",
				name: "Member",
				isDefault: false,
				isSensitive: false,
			})
			.returning();
		if (!memberRole) {
			throw new Error("role insert failed");
		}
		const [actingRoleRow] = await db
			.insert(schema.roles)
			.values({
				appId: app.id,
				code: "billing-admin",
				name: "Billing admin",
				isDefault: false,
				isSensitive: false,
			})
			.returning();
		if (!actingRoleRow) {
			throw new Error("acting role insert failed");
		}

		const [readPriv] = await db
			.insert(schema.privileges)
			.values({ appId: app.id, code: "read:data", name: "Read" })
			.returning();
		const [secretPriv] = await db
			.insert(schema.privileges)
			.values({ appId: app.id, code: "read:secret", name: "Secret" })
			.returning();
		const [viewAsPriv] = await db
			.insert(schema.privileges)
			.values({ appId: app.id, code: "view_as", name: "View as" })
			.returning();
		if (!readPriv || !secretPriv || !viewAsPriv) {
			throw new Error("privilege insert failed");
		}

		await db.insert(schema.rolePrivileges).values([
			{ roleId: memberRole.id, privilegeId: readPriv.id },
			{ roleId: memberRole.id, privilegeId: viewAsPriv.id },
			{ roleId: actingRoleRow.id, privilegeId: secretPriv.id },
		]);

		const [user] = await db
			.insert(schema.users)
			.values({
				email: `authz-user-${suffix}@example.com`,
				displayName: "Authz User",
				status: "active",
			})
			.returning();
		if (!user) {
			throw new Error("user insert failed");
		}
		await db.insert(schema.providerLinks).values({
			provider: "auth0",
			providerSub: idpSub,
			userId: user.id,
			email: user.email,
		});
		await db.insert(schema.memberships).values({
			userId: user.id,
			appOrgId: appOrg.id,
			roleId: memberRole.id,
			status: "active",
		});

		const [ouEast] = await db
			.insert(schema.orgUnits)
			.values({
				appOrgId: appOrg.id,
				code: "east",
				name: "East",
				status: "active",
			})
			.returning();
		const [ouWest] = await db
			.insert(schema.orgUnits)
			.values({
				appOrgId: appOrg.id,
				code: "west",
				name: "West",
				status: "active",
			})
			.returning();
		if (!ouEast || !ouWest) {
			throw new Error("org unit insert failed");
		}

		const [m] = await db
			.select({ id: schema.memberships.id })
			.from(schema.memberships)
			.where(eq(schema.memberships.userId, user.id))
			.limit(1);
		if (!m) {
			throw new Error("membership missing");
		}
		await db.insert(schema.membershipOrgUnits).values({
			membershipId: m.id,
			orgUnitId: ouEast.id,
		});
	});

	afterAll(async () => {
		const { and, eq, inArray } = await import("drizzle-orm");
		const schema = await import("../db/schema.js");
		const orgRows = await db
			.select({ id: schema.orgs.id })
			.from(schema.orgs)
			.where(eq(schema.orgs.code, orgCode));
		const appRows = await db
			.select({ id: schema.apps.id })
			.from(schema.apps)
			.where(eq(schema.apps.code, appCode));
		const orgId = orgRows[0]?.id;
		const appId = appRows[0]?.id;
		if (!orgId || !appId) {
			return;
		}
		const appOrgRows = await db
			.select({ id: schema.appsOrgs.id })
			.from(schema.appsOrgs)
			.where(
				and(eq(schema.appsOrgs.orgId, orgId), eq(schema.appsOrgs.appId, appId)),
			);
		const appOrgId = appOrgRows[0]?.id;
		if (!appOrgId) {
			return;
		}
		const mRows = await db
			.select({ id: schema.memberships.id })
			.from(schema.memberships)
			.innerJoin(
				schema.appsOrgs,
				eq(schema.memberships.appOrgId, schema.appsOrgs.id),
			)
			.where(eq(schema.appsOrgs.id, appOrgId));
		const membershipIds = mRows.map((r) => r.id);
		if (membershipIds.length > 0) {
			await db
				.delete(schema.membershipOrgUnits)
				.where(inArray(schema.membershipOrgUnits.membershipId, membershipIds));
			await db
				.delete(schema.memberships)
				.where(inArray(schema.memberships.id, membershipIds));
		}
		const ouIds = await db
			.select({ id: schema.orgUnits.id })
			.from(schema.orgUnits)
			.where(eq(schema.orgUnits.appOrgId, appOrgId));
		if (ouIds.length > 0) {
			await db.delete(schema.orgUnits).where(
				inArray(
					schema.orgUnits.id,
					ouIds.map((r) => r.id),
				),
			);
		}
		const roleIds = await db
			.select({ id: schema.roles.id })
			.from(schema.roles)
			.where(eq(schema.roles.appId, appId));
		for (const r of roleIds) {
			await db
				.delete(schema.rolePrivileges)
				.where(eq(schema.rolePrivileges.roleId, r.id));
		}
		if (roleIds.length > 0) {
			await db.delete(schema.roles).where(
				inArray(
					schema.roles.id,
					roleIds.map((x) => x.id),
				),
			);
		}
		const privIds = await db
			.select({ id: schema.privileges.id })
			.from(schema.privileges)
			.where(eq(schema.privileges.appId, appId));
		if (privIds.length > 0) {
			await db.delete(schema.privileges).where(
				inArray(
					schema.privileges.id,
					privIds.map((x) => x.id),
				),
			);
		}
		await db.delete(schema.appsOrgs).where(eq(schema.appsOrgs.id, appOrgId));
		await db.delete(schema.apps).where(eq(schema.apps.id, appId));
		await db.delete(schema.orgs).where(eq(schema.orgs.id, orgId));
		const userRows = await db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.email, `authz-user-${suffix}@example.com`));
		const userId = userRows[0]?.id;
		if (userId) {
			await db
				.delete(schema.providerLinks)
				.where(eq(schema.providerLinks.userId, userId));
			await db.delete(schema.users).where(eq(schema.users.id, userId));
		}
	});

	it("allows read:data for the bearer-linked principal", async () => {
		const app = createApp({ db, idp: adapter, listenSql });
		const res = await app.request("/v1/authorize", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				app: appCode,
				org: orgCode,
				privilege: "read:data",
			}),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ allowed: true });
	});

	it("denies an unknown privilege", async () => {
		const app = createApp({ db, idp: adapter, listenSql });
		const res = await app.request("/v1/authorize", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				app: appCode,
				org: orgCode,
				privilege: "write:everything",
			}),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ allowed: false });
	});

	it("honors org-unit ANY vs ALL", async () => {
		const app = createApp({ db, idp: adapter, listenSql });
		const base = {
			app: appCode,
			org: orgCode,
			privilege: "read:data",
			orgUnits: ["east", "west"],
		};
		const anyRes = await app.request("/v1/authorize", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ ...base, anyOrgUnit: true }),
		});
		expect(anyRes.status).toBe(200);
		expect(await anyRes.json()).toEqual({ allowed: true });

		const allRes = await app.request("/v1/authorize", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ ...base, anyOrgUnit: false }),
		});
		expect(allRes.status).toBe(200);
		expect(await allRes.json()).toEqual({ allowed: false });
	});

	it("allows acting_role when membership role has view_as", async () => {
		const app = createApp({ db, idp: adapter, listenSql });
		const res = await app.request("/v1/authorize", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				app: appCode,
				org: orgCode,
				privilege: "read:secret",
				actingRole: "billing-admin",
			}),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ allowed: true });
	});

	it("forwards NOTIFY payloads over the invalidate hub", async () => {
		const hub = createAuthInvalidateHub(listenSql);
		await hub.waitUntilReady();
		let seen = "";
		const unsub = hub.subscribe((p) => {
			seen = p;
		});
		await sql.notify("auth_invalidate", '{"unit":"test"}');
		for (let i = 0; i < 50 && !seen; i++) {
			await new Promise((r) => setTimeout(r, 50));
		}
		unsub();
		expect(seen).toContain("unit");
	});
});
