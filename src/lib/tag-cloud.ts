/** One tag in use, with its totals across all three sections. */
export interface TagCount {
	tag: string;
	count: number;
	notes: number;
	todos: number;
	principles: number;
}
