import { z } from "zod";

const requiredKeys = [
	"IRONCLAD_ISSUER",
	"IRONCLAD_TOKEN_AUDIENCE",
	"KEY_ENCRYPTION_SECRET",
] as const;

const ironcladTokenConfigSchema = z.object({
	IRONCLAD_ISSUER: z.string().url(),
	IRONCLAD_TOKEN_AUDIENCE: z.string().min(1),
	KEY_ENCRYPTION_SECRET: z.string().min(16),
});

export type IroncladTokenConfig = z.infer<typeof ironcladTokenConfigSchema>;

/**
 * When all Ironclad signing variables are unset, returns `null` (feature off).
 * When some but not all are set, throws so misconfiguration is obvious.
 */
export function loadIroncladTokenConfig(): IroncladTokenConfig | null {
	const raw = {
		IRONCLAD_ISSUER: process.env.IRONCLAD_ISSUER?.trim(),
		IRONCLAD_TOKEN_AUDIENCE: process.env.IRONCLAD_TOKEN_AUDIENCE?.trim(),
		KEY_ENCRYPTION_SECRET: process.env.KEY_ENCRYPTION_SECRET?.trim(),
	};
	const anySet = requiredKeys.some((k) => Boolean(process.env[k]?.trim()));
	const allRequiredSet = requiredKeys.every((k) => Boolean(raw[k]));
	if (!anySet) {
		return null;
	}
	if (!allRequiredSet) {
		throw new Error(
			`Ironclad token minting: set all of ${requiredKeys.join(", ")}, or unset every listed variable to disable.`,
		);
	}
	const parsed = ironcladTokenConfigSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`Ironclad token minting: ${parsed.error.message}`);
	}
	return parsed.data;
}
