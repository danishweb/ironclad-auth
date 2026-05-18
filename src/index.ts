import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth0IdpAdapter } from "./auth/auth0.adapter.js";
import { loadIdpEnv } from "./auth/idp-env.js";
import { JwksFetcher } from "./auth/jwks-client.js";
import { db } from "./db/client.js";

const idpEnv = loadIdpEnv();
const jwks = new JwksFetcher(idpEnv.IDP_JWKS_URI);
const idp = createAuth0IdpAdapter({
	issuer: idpEnv.IDP_ISSUER,
	audience: idpEnv.IDP_AUDIENCE,
	getKey: jwks.getKey,
});

const app = createApp({ db, idp });

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`listening on ${info.port}`);
});
