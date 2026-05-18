import { generateKeyPairSync, randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { exportJWK, importSPKI } from "jose";
import type { DbClient } from "../auth/resolve-user.js";
import * as schema from "../db/schema.js";
import { encryptEnvelope } from "./key-envelope.js";

const alg = "RS256" as const;

function isUniqueViolation(e: unknown): boolean {
	return (
		typeof e === "object" &&
		e !== null &&
		"code" in e &&
		(e as { code?: string }).code === "23505"
	);
}

async function insertGeneratedActiveKey(
	db: DbClient,
	keyEncryptionSecret: string,
): Promise<string> {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
	});
	const pemPrivate = privateKey.export({ type: "pkcs8", format: "pem" });
	const pemPublic = publicKey.export({ type: "spki", format: "pem" });
	if (typeof pemPrivate !== "string" || typeof pemPublic !== "string") {
		throw new Error("expected PEM strings from key generation");
	}
	const pubImport = await importSPKI(pemPublic, alg);
	const jwkBase = await exportJWK(pubImport);
	const kid = `ic-${randomUUID()}`;
	const publicJwk = {
		...jwkBase,
		kid,
		use: "sig" as const,
		alg,
	};
	const privateKeyEnc = encryptEnvelope(keyEncryptionSecret, pemPrivate);
	await db.insert(schema.signingKeys).values({
		kid,
		privateKeyEnc,
		publicJwk,
		isActive: true,
	});
	return kid;
}

/**
 * If no active signing key exists, generates RSA-2048 material, encrypts the
 * private key with `KEY_ENCRYPTION_SECRET`, and inserts an active row.
 */
export async function ensureActiveSigningKey(
	db: DbClient,
	keyEncryptionSecret: string,
): Promise<void> {
	const existing = await db
		.select({ kid: schema.signingKeys.kid })
		.from(schema.signingKeys)
		.where(eq(schema.signingKeys.isActive, true))
		.limit(1);
	if (existing[0]) {
		return;
	}
	try {
		await insertGeneratedActiveKey(db, keyEncryptionSecret);
	} catch (e) {
		if (!isUniqueViolation(e)) {
			throw e;
		}
		const again = await db
			.select({ kid: schema.signingKeys.kid })
			.from(schema.signingKeys)
			.where(eq(schema.signingKeys.isActive, true))
			.limit(1);
		if (!again[0]) {
			throw e;
		}
	}
}

export async function loadActiveSigningKeyForSign(
	db: DbClient,
): Promise<{ kid: string; privateKeyEnc: string } | undefined> {
	const row = await db
		.select({
			kid: schema.signingKeys.kid,
			privateKeyEnc: schema.signingKeys.privateKeyEnc,
		})
		.from(schema.signingKeys)
		.where(eq(schema.signingKeys.isActive, true))
		.orderBy(asc(schema.signingKeys.createdAt))
		.limit(1);
	return row[0];
}

export async function loadActivePublicJwks(
	db: DbClient,
): Promise<{ keys: Record<string, unknown>[] }> {
	const rows = await db
		.select({ jwk: schema.signingKeys.publicJwk })
		.from(schema.signingKeys)
		.where(eq(schema.signingKeys.isActive, true))
		.orderBy(asc(schema.signingKeys.createdAt));
	return { keys: rows.map((r) => r.jwk as Record<string, unknown>) };
}

export async function rotateSigningKey(
	db: DbClient,
	keyEncryptionSecret: string,
): Promise<{ kid: string }> {
	return await db.transaction(async (tx) => {
		await tx.update(schema.signingKeys).set({ isActive: false });
		const kid = await insertGeneratedActiveKey(
			tx as unknown as DbClient,
			keyEncryptionSecret,
		);
		return { kid };
	});
}
