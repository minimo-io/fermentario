const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Decoded uploads stay under this size; the client downsizes first. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Longest side of the client-side downscale. */
export const PHOTO_MAX_SIDE = 1280;

/** Decode a `data:image/...;base64,...` URL. Null when not a photo. */
export function decodePhotoUrl(url: string): { bytes: Uint8Array; mime: string } | null {
	const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(url.trim());
	if (!m) return null;
	const mime = m[1];
	if (!PHOTO_MIMES.has(mime)) return null;
	let bytes: Uint8Array;
	try {
		bytes = Uint8Array.from(atob(m[2].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
	if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;
	return { bytes, mime };
}

/** Downscale an image file to a JPEG data URL on the client. Canvas output
 *  is always JPEG: one format on the wire, one MIME family in the table. */
export function fileToPhotoUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const src = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(src);
			const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
			const w = Math.max(1, Math.round(img.width * scale));
			const h = Math.max(1, Math.round(img.height * scale));
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('could not read the image'));
				return;
			}
			ctx.drawImage(img, 0, 0, w, h);
			resolve(canvas.toDataURL('image/jpeg', 0.82));
		};
		img.onerror = () => {
			URL.revokeObjectURL(src);
			reject(new Error('could not read the image'));
		};
		img.src = src;
	});
}
