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

		return { userId: user.id };
	});
}
