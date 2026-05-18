export type VerifiedIdpClaims = {
	sub: string;
	email?: string;
};

export type IdentityProviderAdapter = {
	readonly providerId: string;
	verifyAccessToken(token: string): Promise<VerifiedIdpClaims>;
};
