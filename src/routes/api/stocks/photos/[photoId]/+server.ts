import { getStockPhoto } from '$lib/server/db';

/** One gallery photo. The item id is not part of the URL: photo ids are
 *  unique and scoped by the stock item that owns them. */
export async function GET({ params }) {
	const photo = getStockPhoto(params.photoId);
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
			etag: `"${params.photoId}-${photo.createdAt}"`
		}
	});
}
