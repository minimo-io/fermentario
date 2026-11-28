class DevNetworkStore {
	open = $state(false);

	openModal() {
		this.open = true;
	}

	closeModal() {
		this.open = false;
	}
}

export const devNetwork = new DevNetworkStore();
