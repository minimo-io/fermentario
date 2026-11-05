import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';

/** Note and trade counts per calendar day, all time.
 *
 *  `localtime` matches the `en-CA` day keys the client and Timeline use, because
 *  the app runs the server and the browser on the same machine. A deployment
 *  with the server in another timezone would need the zone passed in. */
export async function GET() {
	const db = getDb();
	const days = db
		.prepare(
			`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
			 FROM notes
			 GROUP BY day
			 ORDER BY day`
		)
		.all() as { day: string; count: number }[];
	// Opening rows are the starting balance, not an event.
	const trades = db
		.prepare(
			`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day,
				SUM(CASE WHEN kind = 'buy' THEN 1 ELSE 0 END) AS buys,
				SUM(CASE WHEN kind = 'sell' THEN 1 ELSE 0 END) AS sells
			 FROM holding_actions
			 WHERE kind IN ('buy', 'sell')
			 GROUP BY day
			 ORDER BY day`
		)
		.all() as { day: string; buys: number; sells: number }[];
	const notes = (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c;
	return json({ days, trades, notes });
}
