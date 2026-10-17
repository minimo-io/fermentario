export interface Note {
	id: string;
	content: string;
	created_at: number;
	updated_at: number;
	tags?: string[];
	pending?: boolean;
	featured?: boolean;
	video?: string;
	commentCount?: number;
}

export interface ChatCtx {
	role: 'user' | 'assistant';
	content: string;
}

export interface AskSource {
	id: string;
	at: number;
	content: string;
}

export interface AskEntry {
	id: string;
	question: string;
	answer: string;
	sources: AskSource[];
	created_at: number;
}

export interface TodoGroup {
	id: string;
	name: string;
	position: number;
	created_at: number;
}

export interface TodoItem {
	id: string;
	group_id: string;
	content: string;
	done: boolean;
	done_at: number;
	inProgress?: boolean;
	commentCount?: number;
	subgroup: string;
	position: number;
	created_at: number;
	updated_at: number;
	tags: string[];
}

export interface Principle {
	id: string;
	content: string;
	position: number;
	created_at: number;
	video: string;
	tags: string[];
	commentCount: number;
}

export interface PrincipleComment {
	id: string;
	principle_id: string;
	content: string;
	created_at: number;
}

export interface TaskComment {
	id: string;
	item_id: string;
	content: string;
	created_at: number;
}

export interface NoteComment {
	id: string;
	note_id: string;
	content: string;
	created_at: number;
}

export interface TodoProgressItem extends TodoItem {
	groupName: string;
}
