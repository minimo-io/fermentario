import { getTodoItemPhoto } from '$lib/server/db';

/** Serve a task image's bytes. Same shape and headers as a note cover. */
export async function GET({ params }) {
	const photo = getTodoItemPhoto(params.photoId);
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
