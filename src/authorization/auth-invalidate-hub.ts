import { EventEmitter } from "node:events";
import type { Sql } from "postgres";

const CHANNEL = "auth_invalidate";

const hubByListenClient = new WeakMap<Sql, ReturnType<typeof buildHub>>();

function buildHub(listenSql: Sql) {
	const hub = new EventEmitter();
	hub.setMaxListeners(0);

	let listenPromise: Promise<void> | null = null;

	function ensureListen(): Promise<void> {
		if (!listenPromise) {
			listenPromise = (async () => {
				await listenSql.listen(CHANNEL, (payload) => {
					hub.emit("message", payload);
				});
			})();
		}
		return listenPromise;
	}

	return {
		waitUntilReady(): Promise<void> {
			return ensureListen();
		},
		subscribe(handler: (payload: string) => void): () => void {
			void ensureListen();
			hub.on("message", handler);
			return () => hub.off("message", handler);
		},
	};
}

/** One hub (single `LISTEN`) per `listenSql` client instance. */
export function createAuthInvalidateHub(listenSql: Sql) {
	let h = hubByListenClient.get(listenSql);
	if (!h) {
		h = buildHub(listenSql);
		hubByListenClient.set(listenSql, h);
	}
	return h;
}

export type AuthInvalidateHub = ReturnType<typeof createAuthInvalidateHub>;
