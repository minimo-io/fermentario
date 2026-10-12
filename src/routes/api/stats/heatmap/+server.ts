import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

/** Note counts per calendar day, all time.
 *
 *  `localtime` matches the `en-CA` day keys the client and Timeline use, because
 *  the app runs the server and the browser on the same machine. A deployment
 *  with the server in another timezone would need the zone passed in. */
export async function GET() {
	const days = db
		.prepare(
			`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
			 FROM notes
			 GROUP BY day
			 ORDER BY day`
		)
		.all() as { day: string; count: number }[];
	const notes = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c;
	return json({ days, notes });
}
