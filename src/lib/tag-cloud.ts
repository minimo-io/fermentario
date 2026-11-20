/** One tag in use, with its totals across every section. `time` counts time
 *  entries, running or stopped. */
export interface TagCount {
	tag: string;
	count: number;
	notes: number;
	todos: number;
	principles: number;
	time: number;
}
