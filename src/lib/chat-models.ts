export interface ChatModelOption {
	id: string;
	label: string;
	detail: string;
	repo: string;
}

export const CHAT_MODELS: ChatModelOption[] = [
	{ id: '0.5b', label: 'Qwen 0.5B', detail: 'fast, light', repo: 'onnx-community/Qwen2.5-0.5B-Instruct' },
	{ id: '1.5b', label: 'Qwen 1.5B', detail: 'better answers & recaps', repo: 'onnx-community/Qwen2.5-1.5B-Instruct' }
];

export const DEFAULT_CHAT_MODEL_ID = '0.5b';