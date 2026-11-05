import { getStockItemPhoto } from '$lib/server/db';

/** Serve the stored photo bytes with their MIME. Lists never embed bytes:
 *  cards load them through this URL with `?v=<updated_at>`. */
export async function GET({ params }) {
	const photo = getStockItemPhoto(params.id);
	if (!photo) {
		return new Response('no photo', {
			status: 404,
			headers: { 'cache-control': 'no-store' }
		});
	}
	return new Response(photo.photo as unknown as BodyInit, {
		status: 200,
		headers: {
			'content-type': photo.mime,
			'cache-control': 'public, max-age=31536000, immutable',
			etag: `"${params.id}-${photo.updatedAt}"`
		}
	});
}
