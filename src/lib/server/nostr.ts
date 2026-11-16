import { getPublicKey, nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools/pure';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import type { NostrEvent, NostrProfile } from '$lib/types';
import { getLastSyncAt } from './nostr-sync';

/** Relays used to bootstrap discovery when the account has no cached list.
 *  `FERMENTARIO_NOSTR_RELAYS` (comma separated) overrides them, which a
 *  self-hosted setup or the smoke test uses to stay on the local relay. */
const FALLBACK_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

export const DEFAULT_RELAYS: string[] = (() => {
	const configured = (process.env.FERMENTARIO_NOSTR_RELAYS ?? '')
		.split(',')
		.map((relay) => relay.trim())
		.filter((relay) => relay.startsWith('ws://') || relay.startsWith('wss://'));
	return configured.length ? configured : FALLBACK_RELAYS;
})();

/** Refuse to wait forever on an offline machine; every caller treats a
 *  timeout as "keep what we have". */
const QUERY_WAIT_MS = 4000;

let wsReady = false;
function pool(): SimplePool {
	if (!wsReady) {
		// Node 22 ships a global WebSocket client; no `ws` client needed here.
		useWebSocketImplementation(globalThis.WebSocket);
		wsReady = true;
	}
	return new SimplePool({ enablePing: true, enableReconnect: true });
}

export function decodeNsec(nsec: string): { secretKey: Uint8Array; npub: string; pubkey: string } | null {
	try {
		const decoded = nip19.decode(String(nsec ?? '').trim());
		if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) return null;
		const secretKey = decoded.data;
		const pubkey = getPublicKey(secretKey);
		return { secretKey, npub: nip19.npubEncode(pubkey), pubkey };
	} catch {
		return null;
	}
}

export function decodeNpub(npub: string): string | null {
	try {
		const decoded = nip19.decode(String(npub ?? '').trim());
		if (decoded.type !== 'npub' || typeof decoded.data !== 'string') return null;
		return decoded.data;
	} catch {
		return null;
	}
}

/** The address other clients add. Derived from the request so it follows the
 *  domain the app is served from; a proxy's forwarded headers win. */
export function relayUrlFrom(url: URL, headers?: Headers): string {
	const forwardedProto = headers?.get('x-forwarded-proto')?.split(',')[0]?.trim();
	const forwardedHost = headers?.get('x-forwarded-host')?.split(',')[0]?.trim();
	const secure = (forwardedProto ?? url.protocol.replace(':', '')) === 'https';
	const host = forwardedHost || url.host;
	return `${secure ? 'wss' : 'ws'}://${host}/relay`;
}

function uniqueRelays(relays: string[]): string[] {
	const seen = new Set<string>();
	for (const relay of relays) {
		const value = String(relay ?? '').trim();
		if (!value.startsWith('ws://') && !value.startsWith('wss://')) continue;
		seen.add(value);
	}
	return [...seen].slice(0, 50);
}

/** Kind 0 metadata and the NIP-65 relay list of one account, read from the
 *  relays. Nothing is stored here; the caller caches the result. */
export async function discoverProfile(
	npub: string,
	seedRelays: string[]
): Promise<{
	foundProfile: boolean;
	name: string;
	about: string;
	picture: string;
	foundRelays: boolean;
	relays: string[];
}> {
	const pubkey = decodeNpub(npub);
	const relays = uniqueRelays([...seedRelays, ...DEFAULT_RELAYS]);
	if (!pubkey) {
		return { foundProfile: false, name: '', about: '', picture: '', foundRelays: false, relays: [] };
	}
	const p = pool();
	let metadata: Event | null = null;
	let relayList: Event | null = null;
	try {
		[metadata, relayList] = await Promise.all([
			p.get(relays, { kinds: [0], authors: [pubkey], limit: 1 }, { maxWait: QUERY_WAIT_MS }),
			p.get(relays, { kinds: [10002], authors: [pubkey], limit: 1 }, { maxWait: QUERY_WAIT_MS })
		]);
	} catch {
		// Offline: report nothing found; the caller keeps its cache.
	} finally {
		try {
			p.close(relays);
		} catch {}
	}

	let name = '';
	let about = '';
	let picture = '';
	let foundProfile = false;
	if (metadata?.content) {
		try {
			const meta = JSON.parse(metadata.content) as Record<string, unknown>;
			name = String(meta.name ?? '').trim().slice(0, 80);
			about = String(meta.about ?? '').trim().slice(0, 500);
			picture = String(meta.picture ?? '').trim().slice(0, 500);
			foundProfile = true;
		} catch {
			foundProfile = false;
		}
	}

	if (relayList?.tags) {
		const listed = relayList.tags
			.filter((tag) => Array.isArray(tag) && tag[0] === 'r' && typeof tag[1] === 'string')
			.map((tag) => tag[1] as string);
		const merged = uniqueRelays([...listed, ...seedRelays]);
		return { foundProfile, name, about, picture, foundRelays: listed.length > 0, relays: merged.length ? merged : DEFAULT_RELAYS };
	}
	return { foundProfile, name, about, picture, foundRelays: false, relays: uniqueRelays(seedRelays).length ? uniqueRelays(seedRelays) : DEFAULT_RELAYS };
}

/** Every kind-1 event the account wrote, as held by the given relays. The
 *  caller verifies and stores them; this only fetches.
 *
 *  `until` pages backwards (inclusive, in unix seconds) and `limit` is the
 *  batch size. Relays apply `limit` per relay, so the union is deduped and
 *  trimmed to the newest `limit` events: the oldest returned event is the
 *  cursor for the next page. */
export async function fetchOwnEvents(
	npub: string,
	seedRelays: string[],
	options: { until?: number; limit?: number } = {}
): Promise<Event[]> {
	const pubkey = decodeNpub(npub);
	if (!pubkey) return [];
	const relays = uniqueRelays([...seedRelays, ...DEFAULT_RELAYS]);
	const limit = Math.min(Math.max(Math.trunc(options.limit ?? 500) || 500, 1), 1000);
	const until = typeof options.until === 'number' && options.until > 0 ? Math.trunc(options.until) : 0;
	const p = pool();
	try {
		const events = await p.querySync(
			relays,
			{ kinds: [1], authors: [pubkey], limit, ...(until ? { until } : {}) },
			{ maxWait: QUERY_WAIT_MS }
		);
		const byId = new Map<string, Event>();
		for (const event of events) byId.set(event.id, event);
		return [...byId.values()]
			.sort((a, b) => b.created_at - a.created_at)
			.slice(0, limit);
	} catch {
		return [];
	} finally {
		try {
			p.close(relays);
		} catch {}
	}
}

/** Best-effort write. Returns the relays that accepted the event. */
export async function publishToRelays(event: Event, seedRelays: string[]): Promise<string[]> {
	const relays = uniqueRelays([...seedRelays, ...DEFAULT_RELAYS]);
	if (relays.length === 0) return [];
	const p = pool();
	try {
		const results = await Promise.allSettled(
			p.publish(relays, event).map((promise) => promise)
		);
		return relays.filter((_, i) => results[i]?.status === 'fulfilled');
	} finally {
		try {
			p.close(relays);
		} catch {}
	}
}

/** Everything the admin UI may know about the account. The nsec is not part
 *  of it: the browser only learns that a key exists. */
export function nostrStatus(
	profile: NostrProfile,
	stats: { notes: number; replies: number; total: number; lastAt: number; lastStoredAt: number },
	url: URL,
	headers?: Headers
) {
	return {
		configured: !!profile.nsec,
		npub: profile.npub,
		name: profile.name,
		about: profile.about,
		picture: profile.picture,
		relays: profile.relays,
		relayUrl: relayUrlFrom(url, headers),
		updatedAt: profile.updatedAt,
		lastSyncAt: getLastSyncAt(),
		stats
	};
}

export type NostrStatus = ReturnType<typeof nostrStatus>;

/** Mark kind-1 events that carry an `e` tag as replies (NIP-10). The tag may
 *  sit in `tags[0]` or after the root marker; the shape is the same. */
export function isReplyEvent(event: { tags: string[][] }): boolean {
	return (event.tags ?? []).some((tag) => Array.isArray(tag) && tag[0] === 'e');
}

export type { NostrEvent };
