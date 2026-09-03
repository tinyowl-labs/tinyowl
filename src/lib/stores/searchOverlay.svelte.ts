/** App-wide Ctrl/Cmd+K search overlay. */

let open = $state(false);
let pageHost = $state<{ focus: () => void } | null>(null);

export const searchOverlay = {
	get open() {
		return open;
	},
	set open(value: boolean) {
		open = value;
	},
	get hasPageHost() {
		return pageHost != null;
	},
	setPageHost(host: { focus: () => void } | null) {
		pageHost = host;
	},
	show() {
		if (pageHost) {
			open = false;
			pageHost.focus();
			return;
		}
		open = true;
	},
	hide() {
		open = false;
	},
	toggle() {
		if (pageHost) {
			if (open) {
				open = false;
			}
			pageHost.focus();
			return;
		}
		open = !open;
	},
};

export function isSearchModK(e: KeyboardEvent): boolean {
	if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey) return false;
	if (e.key !== "k" && e.key !== "K") return false;
	return e.metaKey || e.ctrlKey;
}
