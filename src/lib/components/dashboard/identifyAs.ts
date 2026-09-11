/** How map selection chrome is shown. Sibling to dock preference. */

export type IdentifyAs = "infobox" | "table";

const KEY = "echidna:identify-as";

export function readIdentifyAs(): IdentifyAs {
	if (typeof localStorage === "undefined") return "infobox";
	try {
		const v = localStorage.getItem(KEY);
		return v === "table" ? "table" : "infobox";
	} catch {
		return "infobox";
	}
}

export function writeIdentifyAs(mode: IdentifyAs): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(KEY, mode);
	} catch {
		/* ignore */
	}
}
