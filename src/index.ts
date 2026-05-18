import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth0IdpAdapter } from "./auth/auth0.adapter.js";
import { loadIdpEnv } from "./auth/idp-env.js";
import { JwksFetcher } from "./auth/jwks-client.js";
import { db, listenSql } from "./db/client.js";
import { loadIroncladTokenEnv } from "./token/ironclad-token-env.js";
import { createIroncladTokenSigner } from "./token/ironclad-token-signer.js";

const idpEnv = loadIdpEnv();
const jwks = new JwksFetcher(idpEnv.IDP_JWKS_URI);
const idp = createAuth0IdpAdapter({
	issuer: idpEnv.IDP_ISSUER,
	audience: idpEnv.IDP_AUDIENCE,
	getKey: jwks.getKey,
});

const ironcladTokenEnv = loadIroncladTokenEnv();
const ironcladToken =
	ironcladTokenEnv === null
		? undefined
		: await createIroncladTokenSigner(ironcladTokenEnv);

const app = createApp({ db, idp, listenSql, ironcladToken });

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`listening on ${info.port}`);
});
