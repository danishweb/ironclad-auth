import { Hono } from "hono";
import { count, eq } from "drizzle-orm";
import type { DbClient } from "./auth/resolve-user.js";
import { apps, orgs, users, memberships, appsOrgs, roles, privileges, rolePrivileges } from "./db/schema.js";

type Env = {
	Variables: {
		db: DbClient;
		userId: string;
		idpSub: string;
		email?: string;
	};
};

export const adminRouter = new Hono<Env>();

// Basic Admin Security
adminRouter.use("*", async (c, next) => {
	const { evaluateAuthorization } = await import("./authorization/evaluate-authorization.js");
	const allowed = await evaluateAuthorization(c.get("db"), {
		principalUserId: c.get("userId"),
		app: "ironclad-admin",
		org: "system",
		privilege: "manage:platform",
	});
	if (!allowed) {
		return c.json({ error: "Forbidden: Requires manage:platform privilege" }, 403);
	}
	await next();
});

adminRouter.get("/stats", async (c) => {
	const db = c.get("db");
	const [totalApps] = await db.select({ count: count() }).from(apps);
	const [totalOrgs] = await db.select({ count: count() }).from(orgs);
	const [totalUsers] = await db.select({ count: count() }).from(users);
	const [activeMemberships] = await db.select({ count: count() }).from(memberships).where(eq(memberships.status, "active"));
	
	return c.json({
		totalApps: totalApps.count,
		totalOrgs: totalOrgs.count,
		totalUsers: totalUsers.count,
		activeMemberships: activeMemberships.count,
	});
});

// Users
adminRouter.get("/users", async (c) => {
	const usersList = await c.get("db").select().from(users).limit(100);
	return c.json(usersList);
});

// Apps
adminRouter.get("/apps", async (c) => c.json(await c.get("db").select().from(apps)));
adminRouter.post("/apps", async (c) => {
	const body = await c.req.json();
	const [newApp] = await c.get("db").insert(apps).values(body).returning();
	return c.json(newApp);
});
adminRouter.put("/apps/:id", async (c) => {
	const body = await c.req.json();
	const [updatedApp] = await c.get("db").update(apps).set(body).where(eq(apps.id, c.req.param("id"))).returning();
	return c.json(updatedApp);
});

// Orgs
adminRouter.get("/orgs", async (c) => c.json(await c.get("db").select().from(orgs)));
adminRouter.post("/orgs", async (c) => {
	const body = await c.req.json();
	const [newOrg] = await c.get("db").insert(orgs).values({ code: body.code, name: body.name, parentId: body.parentId || null }).returning();
	return c.json(newOrg);
});
adminRouter.put("/orgs/:id", async (c) => {
	const body = await c.req.json();
	const [updatedOrg] = await c.get("db").update(orgs).set(body).where(eq(orgs.id, c.req.param("id"))).returning();
	return c.json(updatedOrg);
});

// AppOrgs
adminRouter.get("/app-orgs", async (c) => c.json(await c.get("db").select().from(appsOrgs)));
adminRouter.post("/app-orgs", async (c) => {
	const body = await c.req.json();
	const [newAo] = await c.get("db").insert(appsOrgs).values(body).returning();
	return c.json(newAo);
});
adminRouter.delete("/app-orgs/:id", async (c) => {
	await c.get("db").delete(appsOrgs).where(eq(appsOrgs.id, c.req.param("id")));
	return c.json({ success: true });
});

// Roles
adminRouter.get("/roles", async (c) => c.json(await c.get("db").select().from(roles)));
adminRouter.post("/roles", async (c) => {
	const body = await c.req.json();
	const [newRole] = await c.get("db").insert(roles).values(body).returning();
	return c.json(newRole);
});
adminRouter.put("/roles/:id", async (c) => {
	const body = await c.req.json();
	const [updatedRole] = await c.get("db").update(roles).set(body).where(eq(roles.id, c.req.param("id"))).returning();
	return c.json(updatedRole);
});
adminRouter.delete("/roles/:id", async (c) => {
	await c.get("db").delete(roles).where(eq(roles.id, c.req.param("id")));
	return c.json({ success: true });
});

// Privileges
adminRouter.get("/privileges", async (c) => c.json(await c.get("db").select().from(privileges)));
adminRouter.post("/privileges", async (c) => {
	const body = await c.req.json();
	const [newPriv] = await c.get("db").insert(privileges).values(body).returning();
	return c.json(newPriv);
});
adminRouter.delete("/privileges/:id", async (c) => {
	await c.get("db").delete(privileges).where(eq(privileges.id, c.req.param("id")));
	return c.json({ success: true });
});

// Memberships
adminRouter.get("/memberships", async (c) => c.json(await c.get("db").select().from(memberships).limit(100)));
adminRouter.post("/memberships", async (c) => {
	const body = await c.req.json();
	const [newMem] = await c.get("db").insert(memberships).values({ userId: body.userId, appOrgId: body.appOrgId, roleId: body.roleId }).returning();
	return c.json(newMem);
});
adminRouter.put("/memberships/:id", async (c) => {
	const body = await c.req.json();
	const [updatedMem] = await c.get("db").update(memberships).set(body).where(eq(memberships.id, c.req.param("id"))).returning();
	return c.json(updatedMem);
});
adminRouter.delete("/memberships/:id", async (c) => {
	await c.get("db").delete(memberships).where(eq(memberships.id, c.req.param("id")));
	return c.json({ success: true });
});

// Role Privileges
adminRouter.get("/role-privileges", async (c) => {
	return c.json(await c.get("db").select().from(rolePrivileges));
});
adminRouter.post("/role-privileges", async (c) => {
	const body = await c.req.json();
	await c.get("db").insert(rolePrivileges).values(body).onConflictDoNothing();
	return c.json({ success: true });
});
adminRouter.delete("/role-privileges/:roleId/:privilegeId", async (c) => {
    // Note: Drizzle needs 'and' for multiple conditions, but for simplicity let's just delete by roleId and privilegeId
    const { and } = await import("drizzle-orm");
	await c.get("db").delete(rolePrivileges).where(
        and(eq(rolePrivileges.roleId, c.req.param("roleId")), eq(rolePrivileges.privilegeId, c.req.param("privilegeId")))
    );
	return c.json({ success: true });
});

// Provider Links
adminRouter.get("/provider-links", async (c) => {
    // Need to import providerLinks from schema
    const { providerLinks } = await import("./db/schema.js");
	return c.json(await c.get("db").select().from(providerLinks));
});

