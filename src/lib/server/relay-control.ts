import { getMeta, setMeta } from './journal-registry';

/**
 * The relay is attached to the HTTP server at boot; this flag is the switch
 * the Nostr section flips. It lives in the registry so the upgrade listener
 * (plain Node, own connection), the API route and a restart all read the
 * same value.
 *
 * Default is on: an existing install has no key, and a stopped relay must be
 * an explicit choice.
 */
const KEY = 'relay_enabled';

export function isRelayEnabled(): boolean {
	try {
		return getMeta(KEY) !== '0';
	} catch {
		// No registry yet: the relay has nothing to serve, but it is attached.
		return true;
	}
}

export function setRelayEnabled(running: boolean): boolean {
	setMeta(KEY, running ? '1' : '0');
	return running;
}
