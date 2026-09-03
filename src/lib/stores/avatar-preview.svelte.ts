let byUser = $state<Record<string, string>>({});

/** Optimistic avatar data-URLs so Save can update the circle before the network round-trip. */
export const avatarPreview = {
	src(userId: string): string | undefined {
		return byUser[userId];
	},
	set(userId: string, src: string) {
		byUser = { ...byUser, [userId]: src };
	},
	clear(userId: string) {
		if (!(userId in byUser)) return;
		const next = { ...byUser };
		delete next[userId];
		byUser = next;
	},
};
