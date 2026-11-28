import * as kdbx from 'kdbxweb';
import { argon2d, argon2id } from 'hash-wasm';

// Reject unusual KDF settings before allocating memory or doing expensive work.
kdbx.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
	if (version !== 0x13 || memory > 512 * 1024 || iterations > 20 || parallelism > 16) {
		throw new Error('Unsupported Argon2 settings');
	}
	const options = {
		password: new Uint8Array(password),
		salt: new Uint8Array(salt),
		memorySize: memory,
		iterations,
		parallelism,
		hashLength: length,
		outputType: 'binary' as const
	};
	const result = await (type === kdbx.CryptoEngine.Argon2TypeArgon2d ? argon2d(options) : argon2id(options));
	return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
});

let db: kdbx.Kdbx | null = null;
let entries = new Map<string, kdbx.KdbxEntry>();

function text(entry: kdbx.KdbxEntry, name: string): string {
	const value = entry.fields.get(name);
	return typeof value === 'string' ? value : value?.getText() ?? '';
}

self.onmessage = async (event: MessageEvent) => {
	const message = event.data;
	if (message.type === 'unlock') {
		try {
			const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(message.password));
			message.password = '';
			db = await kdbx.Kdbx.load(message.data, credentials);
			entries = new Map();
			const rows: { id: string; title: string; username: string; group: string; url: string }[] = [];
			const recycleId = db.meta.recycleBinUuid?.toString();
			function visit(group: kdbx.KdbxGroup, path: string) {
				if (recycleId && group.uuid.toString() === recycleId) return;
				const groupPath = [path, group.name].filter(Boolean).join(' / ');
				for (const entry of group.entries) {
					const id = entry.uuid.toString();
					entries.set(id, entry);
					rows.push({ id, title: text(entry, 'Title'), username: text(entry, 'UserName'), url: text(entry, 'URL'), group: groupPath });
				}
				for (const child of group.groups) visit(child, groupPath);
			}
			for (const group of db.groups) visit(group, '');
			self.postMessage({ type: 'unlocked', rows });
		} catch {
			db = null;
			entries.clear();
			self.postMessage({ type: 'error', message: 'Could not unlock this database. Check the password and file format or KDF settings.' });
		}
	} else if (message.type === 'entry') {
		const entry = entries.get(message.id);
		if (entry) self.postMessage({ type: 'entry', id: message.id, password: text(entry, 'Password'), notes: text(entry, 'Notes') });
	}
};
