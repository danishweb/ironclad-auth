import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
	pgTable,
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
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		unique("provider_links_provider_provider_sub_unique").on(t.provider, t.providerSub),
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
