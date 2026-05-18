import "dotenv/config";
import { db, sql } from "../db/client.js";
import { rotateSigningKey } from "./signing-keys.js";

function requireSecret(): string {
	const s = process.env.KEY_ENCRYPTION_SECRET?.trim();
	if (!s || s.length < 16) {
		throw new Error("KEY_ENCRYPTION_SECRET (16+ chars) is required");
	}
	return s;
}

const kid = await rotateSigningKey(db, requireSecret());
console.log(`rotated signing key; active kid=${kid.kid}`);
await sql.end({ timeout: 5 });
