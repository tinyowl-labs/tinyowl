/** Shared infobox / create-form placement. Default: docked bottom-right. */

const KEY = "echidna:infobox-dock";

export function readInfoboxDocked(): boolean {
	if (typeof localStorage === "undefined") return true;
	try {
		const v = localStorage.getItem(KEY);
		if (v === null) return true;
		return v === "1";
	} catch {
		return true;
	}
}

export function writeInfoboxDocked(on: boolean): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(KEY, on ? "1" : "0");
	} catch {
		/* ignore */
	}
}
