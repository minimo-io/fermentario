/**
 * Production entry point.
 *
 * adapter-node rejects request bodies above 512 KB unless BODY_SIZE_LIMIT is
 * set. A database restore carries the whole backup file (the route accepts up
 * to 100 MB), so raise the limit before the adapter reads its environment.
 * Keep an explicit deployment value when one is present.
 */
process.env.BODY_SIZE_LIMIT ??= '110M';

// adapter-node owns the HTTP server (env, shims, timeouts, graceful shutdown).
// Take its underlying http.Server and attach the Nostr relay to it, so a
// WebSocket upgrade on /relay reaches our handler instead of 404ing.
const app = await import('../build/index.js');
const httpServer = app.server?.server;
if (!httpServer) {
	throw new Error('adapter-node did not expose its HTTP server; the /relay upgrade cannot attach.');
}

const { attachRelay } = await import('./relay.mjs');
attachRelay(httpServer, {
	dataDir: process.env.FERMENTARIO_DATA_DIR ?? './data'
});
