import { getNotePhoto } from '$lib/server/db';

/** Serve a note cover's bytes. Public: covers render on published pages. */
export async function GET({ params }) {
	const photo = getNotePhoto(params.photoId);
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
