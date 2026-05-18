import { z } from "zod";

const idpEnvSchema = z.object({
	IDP_ISSUER: z.string().min(1),
	IDP_AUDIENCE: z.string().min(1),
	IDP_JWKS_URI: z.string().url(),
});

export type IdpEnv = z.infer<typeof idpEnvSchema>;

export function loadIdpEnv(): IdpEnv {
	const parsed = idpEnvSchema.safeParse({
		IDP_ISSUER: process.env.IDP_ISSUER,
		IDP_AUDIENCE: process.env.IDP_AUDIENCE,
		IDP_JWKS_URI: process.env.IDP_JWKS_URI,
	});
	if (!parsed.success) {
		throw new Error(`Invalid IdP configuration: ${parsed.error.message}`);
	}
	return parsed.data;
}
