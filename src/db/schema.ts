import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
	boolean,
	index,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: text("email").notNull().unique(),
	displayName: text("display_name"),
	status: text("status").notNull().default("active"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const providerLinks = pgTable(
	"provider_links",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		provider: text("provider").notNull(),
		providerSub: text("provider_sub").notNull(),
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		email: text("email"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("provider_links_provider_provider_sub_unique").on(
			t.provider,
			t.providerSub,
		),
		index("provider_links_user_id_idx").on(t.userId),
	],
);

export const orgs = pgTable("orgs", {
	id: uuid("id").defaultRandom().primaryKey(),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	parentId: uuid("parent_id").references((): AnyPgColumn => orgs.id, {
		onDelete: "set null",
	}),
	status: text("status").notNull().default("active"),
});

export const apps = pgTable("apps", {
	id: uuid("id").defaultRandom().primaryKey(),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	status: text("status").notNull().default("active"),
});

export const appsOrgs = pgTable(
	"apps_orgs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		appId: uuid("app_id")
			.references(() => apps.id, { onDelete: "cascade" })
			.notNull(),
		orgId: uuid("org_id")
			.references(() => orgs.id, { onDelete: "cascade" })
			.notNull(),
		status: text("status").notNull().default("active"),
	},
	(t) => [unique("apps_orgs_app_org_unique").on(t.appId, t.orgId)],
);

export const roles = pgTable(
	"roles",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		appId: uuid("app_id")
			.references(() => apps.id, { onDelete: "cascade" })
			.notNull(),
		code: text("code").notNull(),
		name: text("name").notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		isSensitive: boolean("is_sensitive").notNull().default(false),
	},
	(t) => [unique("roles_app_code_unique").on(t.appId, t.code)],
);

export const privileges = pgTable(
	"privileges",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		appId: uuid("app_id")
			.references(() => apps.id, { onDelete: "cascade" })
			.notNull(),
		code: text("code").notNull(),
		name: text("name").notNull(),
	},
	(t) => [unique("privileges_app_code_unique").on(t.appId, t.code)],
);

export const rolePrivileges = pgTable(
	"role_privileges",
	{
		roleId: uuid("role_id")
			.references(() => roles.id, { onDelete: "cascade" })
			.notNull(),
		privilegeId: uuid("privilege_id")
			.references(() => privileges.id, { onDelete: "cascade" })
			.notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.roleId, t.privilegeId] }),
		index("role_privileges_privilege_id_idx").on(t.privilegeId),
	],
);

export const memberships = pgTable(
	"memberships",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		appOrgId: uuid("app_org_id")
			.references(() => appsOrgs.id, { onDelete: "cascade" })
			.notNull(),
		roleId: uuid("role_id")
			.references(() => roles.id, { onDelete: "restrict" })
			.notNull(),
		status: text("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("memberships_user_app_org_idx").on(t.userId, t.appOrgId)],
);

export const orgUnits = pgTable(
	"org_units",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		appOrgId: uuid("app_org_id")
			.references(() => appsOrgs.id, { onDelete: "cascade" })
			.notNull(),
		code: text("code").notNull(),
		name: text("name").notNull(),
		status: text("status").notNull().default("active"),
	},
	(t) => [unique("org_units_app_org_code_unique").on(t.appOrgId, t.code)],
);

export const membershipOrgUnits = pgTable(
	"membership_org_units",
	{
		membershipId: uuid("membership_id")
			.references(() => memberships.id, { onDelete: "cascade" })
			.notNull(),
		orgUnitId: uuid("org_unit_id")
			.references(() => orgUnits.id, { onDelete: "cascade" })
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.membershipId, t.orgUnitId] })],
);

export const apiKeys = pgTable("api_keys", {
	id: uuid("id").defaultRandom().primaryKey(),
	type: text("type").notNull(),
	ownerId: uuid("owner_id").notNull(),
	appOrgId: uuid("app_org_id").references(() => appsOrgs.id, {
		onDelete: "cascade",
	}),
	secretHash: text("secret_hash").notNull().unique(),
	name: text("name").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const signingKeys = pgTable("signing_keys", {
	kid: text("kid").primaryKey(),
	privateKeyEnc: text("private_key_enc").notNull(),
	publicJwk: jsonb("public_jwk").notNull(),
	isActive: boolean("is_active").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
	id: uuid("id").defaultRandom().primaryKey(),
	actorId: uuid("actor_id").notNull(),
	actorType: text("actor_type").notNull(),
	event: text("event").notNull(),
	targetType: text("target_type").notNull(),
	targetId: text("target_id").notNull(),
	metadata: jsonb("metadata"),
	ip: text("ip"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type ProviderLink = InferSelectModel<typeof providerLinks>;
export type Org = InferSelectModel<typeof orgs>;
export type App = InferSelectModel<typeof apps>;
export type AppOrg = InferSelectModel<typeof appsOrgs>;
export type Role = InferSelectModel<typeof roles>;
export type Privilege = InferSelectModel<typeof privileges>;
export type RolePrivilege = InferSelectModel<typeof rolePrivileges>;
export type Membership = InferSelectModel<typeof memberships>;
export type OrgUnit = InferSelectModel<typeof orgUnits>;
export type MembershipOrgUnit = InferSelectModel<typeof membershipOrgUnits>;
export type ApiKey = InferSelectModel<typeof apiKeys>;
export type SigningKey = InferSelectModel<typeof signingKeys>;
export type AuditLog = InferSelectModel<typeof auditLogs>;
