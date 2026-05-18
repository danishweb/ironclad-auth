import { z } from "zod";

const requiredKeys = [
	"IRONCLAD_ISSUER",
	"IRONCLAD_TOKEN_AUDIENCE",
	"IRONCLAD_PRIVATE_KEY_PEM",
] as const;

const optionalKeys = ["IRONCLAD_TOKEN_KID"] as const;

const ironcladTokenEnvSchema = z.object({
	IRONCLAD_ISSUER: z.string().url(),
	IRONCLAD_TOKEN_AUDIENCE: z.string().min(1),
	IRONCLAD_PRIVATE_KEY_PEM: z.string().min(1),
	IRONCLAD_TOKEN_KID: z.string().min(1).default("ironclad-primary"),
});

export type IroncladTokenEnv = z.infer<typeof ironcladTokenEnvSchema>;

/**
 * When all Ironclad signing variables are unset, returns `null` (feature off).
 * When some but not all are set, throws so misconfiguration is obvious.
 */
export function loadIroncladTokenEnv(): IroncladTokenEnv | null {
	const raw = {
		IRONCLAD_ISSUER: process.env.IRONCLAD_ISSUER?.trim(),
		IRONCLAD_TOKEN_AUDIENCE: process.env.IRONCLAD_TOKEN_AUDIENCE?.trim(),
		IRONCLAD_PRIVATE_KEY_PEM: process.env.IRONCLAD_PRIVATE_KEY_PEM?.trim(),
		IRONCLAD_TOKEN_KID: process.env.IRONCLAD_TOKEN_KID?.trim(),
	};
	const anyIroncladVar = [...requiredKeys, ...optionalKeys].some((k) =>
		Boolean(process.env[k]?.trim()),
	);
	const allRequiredSet = requiredKeys.every((k) => Boolean(raw[k]));
	if (!anyIroncladVar) {
		return null;
	}
	if (!allRequiredSet) {
		throw new Error(
			`Ironclad token signing: set all of ${requiredKeys.join(", ")} (and optional IRONCLAD_TOKEN_KID), or unset every IRONCLAD_* variable to disable minting.`,
		);
	}
	const parsed = ironcladTokenEnvSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`Ironclad token signing: ${parsed.error.message}`);
	}
	return parsed.data;
}
