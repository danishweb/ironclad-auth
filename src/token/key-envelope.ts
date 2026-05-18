import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";

const VERSION = 1;
const SCRYPT_SALT = Buffer.from("ironclad:key-envelope:v1", "utf8");

function deriveKey(secret: string): Buffer {
	return scryptSync(secret, SCRYPT_SALT, 32);
}

export function encryptEnvelope(secret: string, plaintext: string): string {
	const key = deriveKey(secret);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return JSON.stringify({
		v: VERSION,
		iv: iv.toString("base64url"),
		tag: tag.toString("base64url"),
		d: enc.toString("base64url"),
	});
}

export function decryptEnvelope(secret: string, envelopeJson: string): string {
	const parsed = JSON.parse(envelopeJson) as {
		v?: number;
		iv?: string;
		tag?: string;
		d?: string;
	};
	if (parsed.v !== VERSION) {
		throw new Error("unsupported key envelope version");
	}
	if (!parsed.iv || !parsed.tag || !parsed.d) {
		throw new Error("invalid key envelope payload");
	}
	const key = deriveKey(secret);
	const iv = Buffer.from(parsed.iv, "base64url");
	const tag = Buffer.from(parsed.tag, "base64url");
	const data = Buffer.from(parsed.d, "base64url");
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString(
		"utf8",
	);
}
