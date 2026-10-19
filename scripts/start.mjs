/**
 * Production entry point.
 *
 * adapter-node rejects request bodies above 512 KB unless BODY_SIZE_LIMIT is
 * set. A database restore carries the whole backup file (the route accepts up
 * to 100 MB), so raise the limit before the adapter reads its environment.
 * Keep an explicit deployment value when one is present.
 */
process.env.BODY_SIZE_LIMIT ??= '110M';
await import('../build/index.js');
