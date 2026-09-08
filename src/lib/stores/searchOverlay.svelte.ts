/** App-wide Ctrl/Cmd+K search overlay. */

import { matchPrefShortcut } from "$lib/shortcuts";

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
	if (e.repeat) return false;
	return matchPrefShortcut(e, ["global"], { typing: false }) === "search-toggle";
}
