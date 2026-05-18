import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, sql } from "./client.js";
import {
	apps,
	appsOrgs,
	memberships,
	orgs,
	privileges,
	providerLinks,
	rolePrivileges,
	roles,
	users,
} from "./schema.js";

async function getOrInsertOrg() {
	const existing = await db
		.select()
		.from(orgs)
		.where(eq(orgs.code, "acme-corp"))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(orgs)
		.values({ code: "acme-corp", name: "Acme Corp", status: "active" })
		.returning();
	if (!row) {
		throw new Error("failed to insert org");
	}
	return row;
}

async function getOrInsertApp() {
	const existing = await db
		.select()
		.from(apps)
		.where(eq(apps.code, "billing"))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(apps)
		.values({ code: "billing", name: "Billing", status: "active" })
		.returning();
	if (!row) {
		throw new Error("failed to insert app");
	}
	return row;
}

async function getOrInsertAppOrg(appId: string, orgId: string) {
	const existing = await db
		.select()
		.from(appsOrgs)
		.where(and(eq(appsOrgs.appId, appId), eq(appsOrgs.orgId, orgId)))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(appsOrgs)
		.values({ appId, orgId, status: "active" })
		.returning();
	if (!row) {
		throw new Error("failed to insert apps_orgs");
	}
	return row;
}

async function getOrInsertUser() {
	const existing = await db
		.select()
		.from(users)
		.where(eq(users.email, "admin@acme.example"))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(users)
		.values({
			email: "admin@acme.example",
			displayName: "Acme Admin",
			status: "active",
		})
		.returning();
	if (!row) {
		throw new Error("failed to insert user");
	}
	return row;
}

async function getOrInsertRole(appId: string, code: string, name: string) {
	const existing = await db
		.select()
		.from(roles)
		.where(and(eq(roles.appId, appId), eq(roles.code, code)))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(roles)
		.values({ appId, code, name, isDefault: false, isSensitive: false })
		.returning();
	if (!row) {
		throw new Error("failed to insert role");
	}
	return row;
}

async function getOrInsertPrivilege(appId: string, code: string, name: string) {
	const existing = await db
		.select()
		.from(privileges)
		.where(and(eq(privileges.appId, appId), eq(privileges.code, code)))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(privileges)
		.values({ appId, code, name })
		.returning();
	if (!row) {
		throw new Error("failed to insert privilege");
	}
	return row;
}

async function linkRolePrivilege(roleId: string, privilegeId: string) {
	const existing = await db
		.select()
		.from(rolePrivileges)
		.where(
			and(
				eq(rolePrivileges.roleId, roleId),
				eq(rolePrivileges.privilegeId, privilegeId),
			),
		)
		.limit(1);
	if (existing[0]) {
		return;
	}
	await db.insert(rolePrivileges).values({ roleId, privilegeId });
}

async function getOrInsertMembership(
	userId: string,
	appOrgId: string,
	roleId: string,
) {
	const existing = await db
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.userId, userId),
				eq(memberships.appOrgId, appOrgId),
				eq(memberships.roleId, roleId),
			),
		)
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(memberships)
		.values({ userId, appOrgId, roleId, status: "active" })
		.returning();
	if (!row) {
		throw new Error("failed to insert membership");
	}
	return row;
}

async function getOrInsertProviderLink(
	provider: string,
	providerSub: string,
	userId: string,
) {
	const existing = await db
		.select()
		.from(providerLinks)
		.where(
			and(
				eq(providerLinks.provider, provider),
				eq(providerLinks.providerSub, providerSub),
			),
		)
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [row] = await db
		.insert(providerLinks)
		.values({
			provider,
			providerSub,
			userId,
			email: "admin@acme.example",
		})
		.returning();
	if (!row) {
		throw new Error("failed to insert provider link");
	}
	return row;
}

async function seed() {
	const org = await getOrInsertOrg();
	const app = await getOrInsertApp();
	const appOrg = await getOrInsertAppOrg(app.id, org.id);
	const user = await getOrInsertUser();

	const adminRole = await getOrInsertRole(app.id, "admin", "Administrator");
	const readPriv = await getOrInsertPrivilege(
		app.id,
		"read:reports",
		"Read reports",
	);
	const writePriv = await getOrInsertPrivilege(
		app.id,
		"write:invoices",
		"Write invoices",
	);

	await linkRolePrivilege(adminRole.id, readPriv.id);
	await linkRolePrivilege(adminRole.id, writePriv.id);

	await getOrInsertMembership(user.id, appOrg.id, adminRole.id);
	await getOrInsertProviderLink("auth0", "seed|admin-acme", user.id);
}

await seed();
console.log("seed complete");
await sql.end({ timeout: 5 });
