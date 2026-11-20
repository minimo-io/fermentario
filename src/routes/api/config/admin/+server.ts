import { json } from '@sveltejs/kit';
import { getAdminConfig, setAdminConfig } from '$lib/server/db';

export async function GET() {
	return json({ adminConfig: getAdminConfig() });
}

export async function PATCH({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid JSON' }, { status: 400 });
	}
	if (!body || typeof body !== 'object' || typeof (body as { motto?: unknown }).motto !== 'string') {
		return json({ error: 'motto must be a string' }, { status: 400 });
	}
	return json({ adminConfig: setAdminConfig({ motto: (body as { motto: string }).motto }) });
}
