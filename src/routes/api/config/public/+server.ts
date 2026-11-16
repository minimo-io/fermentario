import { json } from '@sveltejs/kit';
import { getPublicConfig, setPublicConfig } from '$lib/server/db';

export async function GET() {
	return json({ publicConfig: getPublicConfig() });
}

export async function PATCH({ request }) {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'invalid JSON' }, { status: 400 });
	}
	return json({ publicConfig: setPublicConfig(body) });
}
