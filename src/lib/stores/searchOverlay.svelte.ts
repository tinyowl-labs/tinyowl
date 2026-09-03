/** App-wide Ctrl/Cmd+K search overlay. */

let open = $state(false);

export const searchOverlay = {
	get open() {
		return open;
	},
	set open(value: boolean) {
		open = value;
	},
	show() {
		open = true;
	},
	hide() {
		open = false;
	},
	toggle() {
		open = !open;
	},
};

export function isSearchModK(e: KeyboardEvent): boolean {
	if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey) return false;
	if (e.key !== "k" && e.key !== "K") return false;
	return e.metaKey || e.ctrlKey;
}
