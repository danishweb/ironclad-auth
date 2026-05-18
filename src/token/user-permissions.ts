import { and, eq } from "drizzle-orm";
import type { DbClient } from "../auth/resolve-user.js";
import * as schema from "../db/schema.js";

export type UserPermissionRow = {
	app: string;
	org: string;
	privilege: string;
};

export async function listUserPermissionRows(
	db: DbClient,
	userId: string,
): Promise<UserPermissionRow[]> {
	const rows = await db
		.select({
			app: schema.apps.code,
			org: schema.orgs.code,
			privilege: schema.privileges.code,
		})
		.from(schema.memberships)
		.innerJoin(
			schema.appsOrgs,
			eq(schema.memberships.appOrgId, schema.appsOrgs.id),
		)
		.innerJoin(schema.apps, eq(schema.appsOrgs.appId, schema.apps.id))
		.innerJoin(schema.orgs, eq(schema.appsOrgs.orgId, schema.orgs.id))
		.innerJoin(
			schema.rolePrivileges,
			eq(schema.rolePrivileges.roleId, schema.memberships.roleId),
		)
		.innerJoin(
			schema.privileges,
			eq(schema.rolePrivileges.privilegeId, schema.privileges.id),
		)
		.where(
			and(
				eq(schema.memberships.userId, userId),
				eq(schema.memberships.status, "active"),
				eq(schema.appsOrgs.status, "active"),
			),
		);

	const seen = new Set<string>();
	const out: UserPermissionRow[] = [];
	for (const r of rows) {
		const k = `${r.app}:${r.org}:${r.privilege}`;
		if (seen.has(k)) {
			continue;
		}
		seen.add(k);
		out.push({ app: r.app, org: r.org, privilege: r.privilege });
	}
	return out;
}

export function toQualifiedPermissionStrings(
	rows: UserPermissionRow[],
): string[] {
	return [
		...new Set(rows.map((r) => `${r.app}:${r.org}:${r.privilege}`)),
	].sort();
}

export function distinctOrgCodes(rows: UserPermissionRow[]): string[] {
	return [...new Set(rows.map((r) => r.org))].sort();
}

export function buildUserinfoPayload(
	rows: UserPermissionRow[],
	input: { sub: string; idpSub: string },
): {
	sub: string;
	idp_sub: string;
	orgs: string[];
	applications: Record<string, Record<string, { privileges: string[] }>>;
} {
	const orgs = distinctOrgCodes(rows);
	const byApp = new Map<string, Map<string, Set<string>>>();
	for (const r of rows) {
		if (!byApp.has(r.app)) {
			byApp.set(r.app, new Map());
		}
		const byOrg = byApp.get(r.app);
		if (!byOrg) {
			continue;
		}
		if (!byOrg.has(r.org)) {
			byOrg.set(r.org, new Set());
		}
		byOrg.get(r.org)?.add(r.privilege);
	}
	const applications: Record<
		string,
		Record<string, { privileges: string[] }>
	> = {};
	for (const [app, orgMap] of byApp) {
		applications[app] = {};
		for (const [org, privs] of orgMap) {
			applications[app][org] = { privileges: [...privs].sort() };
		}
	}
	return {
		sub: input.sub,
		idp_sub: input.idpSub,
		orgs,
		applications,
	};
}
