class HelpStore {
	open = $state(false);

	openModal() {
		this.open = true;
	}

	closeModal() {
		this.open = false;
	}
}

export const help = new HelpStore();
