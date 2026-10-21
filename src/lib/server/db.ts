import type { Journal } from '$lib/platform/journal';
import { getDb, getJournal, NoActiveJournalError } from './journal-store';

/**
 * The 11 API routes still import named database functions from here. They are
 * lazy delegates now: the journal file is opened on first use, not when this
 * module is imported. The active journal can be missing, broken or replaced
 * without every route discovering that at module-evaluation time.
 */

function bind<K extends keyof Journal>(key: K): Journal[K] {
	return ((...args: unknown[]) => {
		const fn = getJournal()[key] as unknown as (...inner: unknown[]) => unknown;
		return fn(...args);
	}) as Journal[K];
}

export const createNote = bind('createNote');
export const deleteNote = bind('deleteNote');
export const updateNote = bind('updateNote');
export const getNote = bind('getNote');
export const listNotesPage = bind('listNotesPage');
export const countNotesByTag = bind('countNotesByTag');
export const notesMissingVectors = bind('notesMissingVectors');
export const notesBetween = bind('notesBetween');
export const setNoteTags = bind('setNoteTags');
export const removeNoteTag = bind('removeNoteTag');
export const setNoteFeatured = bind('setNoteFeatured');
export const setNoteVideo = bind('setNoteVideo');
export const notesMissingTags = bind('notesMissingTags');
export const setVector = bind('setVector');
export const allVectors = bind('allVectors');
export const ftsCandidateIds = bind('ftsCandidateIds');
export const countNotes = bind('countNotes');
export const latestTimestamp = bind('latestTimestamp');
export const getWeeklyRecap = bind('getWeeklyRecap');
export const saveWeeklyRecap = bind('saveWeeklyRecap');
export const insertAsk = bind('insertAsk');
export const listAsks = bind('listAsks');
export const deleteAsk = bind('deleteAsk');
export const listTodoGroups = bind('listTodoGroups');
export const createTodoGroup = bind('createTodoGroup');
export const renameTodoGroup = bind('renameTodoGroup');
export const deleteTodoGroup = bind('deleteTodoGroup');
export const setTodoGroupOrder = bind('setTodoGroupOrder');
export const listTodoItems = bind('listTodoItems');
export const getTodoItem = bind('getTodoItem');
export const createTodoItem = bind('createTodoItem');
export const updateTodoItem = bind('updateTodoItem');
export const deleteTodoItem = bind('deleteTodoItem');
export const setTodoItemTags = bind('setTodoItemTags');
export const listTodoItemsByTag = bind('listTodoItemsByTag');
export const setTodoItemOrder = bind('setTodoItemOrder');
export const listInProgressItems = bind('listInProgressItems');
export const listDoneItems = bind('listDoneItems');
export const listTaskComments = bind('listTaskComments');
export const createTaskComment = bind('createTaskComment');
export const updateTaskComment = bind('updateTaskComment');
export const deleteTaskComment = bind('deleteTaskComment');
export const listNoteComments = bind('listNoteComments');
export const createNoteComment = bind('createNoteComment');
export const updateNoteComment = bind('updateNoteComment');
export const deleteNoteComment = bind('deleteNoteComment');
export const listPrinciples = bind('listPrinciples');
export const createPrinciple = bind('createPrinciple');
export const updatePrinciple = bind('updatePrinciple');
export const deletePrinciple = bind('deletePrinciple');
export const setPrincipleOrder = bind('setPrincipleOrder');
export const setPrincipleVideo = bind('setPrincipleVideo');
export const listPrinciplesByTag = bind('listPrinciplesByTag');
export const setPrincipleTags = bind('setPrincipleTags');
export const listPrincipleComments = bind('listPrincipleComments');
export const createPrincipleComment = bind('createPrincipleComment');
export const updatePrincipleComment = bind('updatePrincipleComment');
export const deletePrincipleComment = bind('deletePrincipleComment');
export const listTagColors = bind('listTagColors');
export const setTagColor = bind('setTagColor');

export { getDb, getJournal, NoActiveJournalError };

export type {
	Note,
	NoteRow,
	NoteCursor,
	NotePage,
	AskRow,
	Ask,
	TodoGroup,
	TodoItem,
	TodoProgressItem,
	TaskComment,
	NoteComment,
	Principle
} from '$lib/platform/journal';
