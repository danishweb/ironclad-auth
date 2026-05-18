import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth0IdpAdapter } from "./auth/auth0.adapter.js";
import { loadIdpEnv } from "./auth/idp-env.js";
import { JwksFetcher } from "./auth/jwks-client.js";
import { db, listenSql } from "./db/client.js";
import {
	createDbIroncladTokenSigner,
	type IroncladTokenSigner,
} from "./token/db-ironclad-token-signer.js";
import { loadIroncladTokenConfig } from "./token/ironclad-token-config.js";
import { ensureActiveSigningKey } from "./token/signing-keys.js";

const idpEnv = loadIdpEnv();
const jwks = new JwksFetcher(idpEnv.IDP_JWKS_URI);
const idp = createAuth0IdpAdapter({
	issuer: idpEnv.IDP_ISSUER,
	audience: idpEnv.IDP_AUDIENCE,
	getKey: jwks.getKey,
});

const tokenCfg = loadIroncladTokenConfig();
let ironcladToken: IroncladTokenSigner | undefined;
if (tokenCfg) {
	await ensureActiveSigningKey(db, tokenCfg.KEY_ENCRYPTION_SECRET);
	ironcladToken = await createDbIroncladTokenSigner(db, {
		issuer: tokenCfg.IRONCLAD_ISSUER,
		defaultAudience: tokenCfg.IRONCLAD_TOKEN_AUDIENCE,
		keyEncryptionSecret: tokenCfg.KEY_ENCRYPTION_SECRET,
	});
}

const app = createApp({ db, idp, listenSql, ironcladToken });

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`listening on ${info.port}`);
});
