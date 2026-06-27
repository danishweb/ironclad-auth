import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";

export type DbClient = PostgresJsDatabase<typeof schema>;

function syntheticEmail(provider: string, providerSub: string): string {
	const safe = providerSub.replace(/[^a-zA-Z0-9._-]/g, "_");
	return `idp.${provider}.${safe}@internal.invalid`;
}

/**
 * Maps IdP subject to an internal user, creating both rows on first sight.
 */
export async function resolveOrCreateUser(
	db: DbClient,
	provider: string,
	providerSub: string,
	emailFromToken?: string,
): Promise<{ userId: string }> {
	return await db.transaction(async (tx) => {
		const existingLink = await tx
			.select()
			.from(schema.providerLinks)
			.where(
				and(
					eq(schema.providerLinks.provider, provider),
					eq(schema.providerLinks.providerSub, providerSub),
				),
			)
			.limit(1);
		if (existingLink[0]) {
			return { userId: existingLink[0].userId };
		}

		const email = emailFromToken ?? syntheticEmail(provider, providerSub);
		const [user] = await tx
			.insert(schema.users)
			.values({
				email,
				displayName: emailFromToken ?? providerSub,
				status: "active",
			})
			.returning();
		if (!user) {
			throw new Error("failed to insert user");
		}

		await tx.insert(schema.providerLinks).values({
			provider,
			providerSub,
			userId: user.id,
			email: emailFromToken ?? null,
		});

		// Auto-bootstrap admin if email matches ADMIN_EMAILS
		const adminEmails = process.env.ADMIN_EMAILS;
		if (adminEmails && emailFromToken && adminEmails.split(",").map(e => e.trim()).includes(emailFromToken)) {
			let [org] = await tx.select().from(schema.orgs).where(eq(schema.orgs.code, 'system')).limit(1);
			if (!org) [org] = await tx.insert(schema.orgs).values({ code: 'system', name: 'System Organization' }).returning();
			
			let [app] = await tx.select().from(schema.apps).where(eq(schema.apps.code, 'ironclad-admin')).limit(1);
			if (!app) [app] = await tx.insert(schema.apps).values({ code: 'ironclad-admin', name: 'Ironclad Admin' }).returning();
			
			let [appOrg] = await tx.select().from(schema.appsOrgs).where(and(eq(schema.appsOrgs.appId, app.id), eq(schema.appsOrgs.orgId, org.id))).limit(1);
			if (!appOrg) [appOrg] = await tx.insert(schema.appsOrgs).values({ appId: app.id, orgId: org.id }).returning();
			
			let [role] = await tx.select().from(schema.roles).where(and(eq(schema.roles.appId, app.id), eq(schema.roles.code, 'admin'))).limit(1);
			if (!role) [role] = await tx.insert(schema.roles).values({ appId: app.id, code: 'admin', name: 'Platform Administrator' }).returning();
			
			let [priv] = await tx.select().from(schema.privileges).where(and(eq(schema.privileges.appId, app.id), eq(schema.privileges.code, 'manage:platform'))).limit(1);
			if (!priv) [priv] = await tx.insert(schema.privileges).values({ appId: app.id, code: 'manage:platform', name: 'Manage Platform' }).returning();
			
			await tx.insert(schema.rolePrivileges).values({ roleId: role.id, privilegeId: priv.id }).onConflictDoNothing();
			
			const existingMem = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.userId, user.id), eq(schema.memberships.appOrgId, appOrg.id), eq(schema.memberships.roleId, role.id))).limit(1);
			if (!existingMem[0]) {
				await tx.insert(schema.memberships).values({ userId: user.id, appOrgId: appOrg.id, roleId: role.id });
			}
		}

		return { userId: user.id };
	});
}
