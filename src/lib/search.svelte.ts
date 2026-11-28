/** One open/closed slot for the global search palette.
 *
 *  Mounted once in the root layout. The home header pill and the Cmd/Ctrl+K
 *  handler both write to the same store, so they always open the same modal. */
class SearchStore {
	open = $state(false);
	openInCommandMode = $state(false);

	openSearch() {
		this.openInCommandMode = false;
		this.open = true;
	}

	openCommands() {
		this.openInCommandMode = true;
		this.open = true;
	}

	closeSearch() {
		this.open = false;
		this.openInCommandMode = false;
	}
}

export const search = new SearchStore();
