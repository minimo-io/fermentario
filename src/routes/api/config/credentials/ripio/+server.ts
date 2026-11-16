import { json } from '@sveltejs/kit';
import { deleteApiCredential, getApiCredentialStatus, setApiCredential } from '$lib/server/db';

/** Ripio Trade API credentials. The response never carries the token or
 *  the secret — only whether they exist and when they were saved. */
export async function GET() {
	return json(getApiCredentialStatus('ripio'));
}

export async function PUT({ request }) {
	const body = await request.json().catch(() => ({}));
	const status = setApiCredential('ripio', body?.token, body?.secret);
	if (!status) return json({ error: 'token and secret are both required' }, { status: 400 });
	return json(status);
}

export async function DELETE() {
	return json(deleteApiCredential('ripio'));
}
