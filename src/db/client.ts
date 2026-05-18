import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

function requireDatabaseUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is required");
	}
	return url;
}

const connectionString = requireDatabaseUrl();

export const sql = postgres(connectionString, { max: 10 });

export const db = drizzle(sql, { schema });
