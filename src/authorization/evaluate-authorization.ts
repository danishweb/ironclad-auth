import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "../auth/resolve-user.js";
import * as schema from "../db/schema.js";

const uuidRe =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolvePrincipalUserId(
	db: DbClient,
	sub: string,
	provider: string,
): Promise<string | null> {
	if (uuidRe.test(sub)) {
		const row = await db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.id, sub))
			.limit(1);
		return row[0]?.id ?? null;
	}
	const link = await db
		.select({ userId: schema.providerLinks.userId })
		.from(schema.providerLinks)
		.where(
			and(
				eq(schema.providerLinks.provider, provider),
				eq(schema.providerLinks.providerSub, sub),
			),
		)
		.limit(1);
	return link[0]?.userId ?? null;
}

export type AuthorizeRequest = {
	principalUserId: string;
	app: string;
	org: string;
	privilege: string;
	orgUnits?: string[];
	anyOrgUnitAuthorized?: boolean;
	actingRole?: string;
	viewAsPrivilege?: string;
};

function orgUnitClause(
	mAlias: ReturnType<typeof sql>,
	orgUnits: string[] | undefined,
	anyOrg: boolean | undefined,
) {
	if (!orgUnits || orgUnits.length === 0) {
		return sql`true`;
	}
	const parts = orgUnits.map((c) => sql`${c}`);
	const list = sql.join(parts, sql`, `);
	if (anyOrg) {
		return sql`exists (
			select 1
			from ${schema.membershipOrgUnits} mou_any
			join ${schema.orgUnits} ou_any on ou_any.id = mou_any.org_unit_id
			where mou_any.membership_id = ${mAlias}.id
				and ou_any.status = 'active'
				and ou_any.code in (${list})
		)`;
	}
	return sql`(
		select count(*) from unnest(array[${list}]::text[]) as req(code)
		where not exists (
			select 1
			from ${schema.membershipOrgUnits} mou_all
			join ${schema.orgUnits} ou_all on ou_all.id = mou_all.org_unit_id
			where mou_all.membership_id = ${mAlias}.id
				and ou_all.status = 'active'
				and ou_all.code = req.code
		)
	) = 0`;
}

export async function evaluateAuthorization(
	db: DbClient,
	req: AuthorizeRequest,
): Promise<boolean> {
	const ouClause = orgUnitClause(
		sql`m`,
		req.orgUnits,
		req.anyOrgUnitAuthorized,
	);

	if (!req.actingRole) {
		const viewAsExtra =
			req.viewAsPrivilege !== undefined && req.viewAsPrivilege.length > 0
				? sql`and exists (
					select 1
					from ${schema.rolePrivileges} rp_va
					join ${schema.privileges} p_va on p_va.id = rp_va.privilege_id
					where rp_va.role_id = m.role_id
						and p_va.code = ${req.viewAsPrivilege}
				)`
				: sql``;

		const result = await db.execute(sql`
			select exists (
				select 1
				from ${schema.memberships} m
				join ${schema.appsOrgs} ao on ao.id = m.app_org_id
				join ${schema.apps} a on a.id = ao.app_id
				join ${schema.orgs} o on o.id = ao.org_id
				join ${schema.rolePrivileges} rp on rp.role_id = m.role_id
				join ${schema.privileges} p on p.id = rp.privilege_id
				where m.user_id = ${req.principalUserId}::uuid
					and a.code = ${req.app}
					and o.code = ${req.org}
					and p.code = ${req.privilege}
					and m.status = 'active'
					and ao.status = 'active'
					and ${ouClause}
					${viewAsExtra}
			) as allowed
		`);
		const row = result[0] as { allowed: boolean } | undefined;
		return Boolean(row?.allowed);
	}

	const viewAsExtraActing =
		req.viewAsPrivilege !== undefined && req.viewAsPrivilege.length > 0
			? sql`and exists (
				select 1
				from ${schema.rolePrivileges} rp_va2
				join ${schema.privileges} p_va2 on p_va2.id = rp_va2.privilege_id
				where rp_va2.role_id = r_acting.id
					and p_va2.code = ${req.viewAsPrivilege}
			)`
			: sql``;

	const result = await db.execute(sql`
		select exists (
			select 1
			from ${schema.memberships} m
			join ${schema.appsOrgs} ao on ao.id = m.app_org_id
			join ${schema.apps} a on a.id = ao.app_id
			join ${schema.orgs} o on o.id = ao.org_id
			join ${schema.roles} r_user on r_user.id = m.role_id
			join ${schema.roles} r_acting on r_acting.app_id = a.id and r_acting.code = ${req.actingRole}
			join ${schema.rolePrivileges} rp_act on rp_act.role_id = r_acting.id
			join ${schema.privileges} p_req on p_req.id = rp_act.privilege_id
			where m.user_id = ${req.principalUserId}::uuid
				and a.code = ${req.app}
				and o.code = ${req.org}
				and p_req.code = ${req.privilege}
				and m.status = 'active'
				and ao.status = 'active'
				and exists (
					select 1
					from ${schema.rolePrivileges} rp_vs
					join ${schema.privileges} p_vs on p_vs.id = rp_vs.privilege_id
					where rp_vs.role_id = r_user.id
						and p_vs.code = 'view_as'
				)
				and ${ouClause}
				${viewAsExtraActing}
		) as allowed
	`);
	const row = result[0] as { allowed: boolean } | undefined;
	return Boolean(row?.allowed);
}
