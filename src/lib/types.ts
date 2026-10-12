export interface Note {
	id: string;
	content: string;
	created_at: number;
	updated_at: number;
	tags?: string[];
	pending?: boolean;
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
