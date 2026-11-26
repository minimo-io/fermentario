declare module 'markdown-it-task-lists' {
	import type MarkdownIt from 'markdown-it';

	type TaskListOptions = { enabled?: boolean };

	export default function taskLists(md: MarkdownIt, options?: TaskListOptions): void;
}
