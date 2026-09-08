/** Optional Header extras that cannot be derived from `$page` (docs sidebar). */

type Sidebar = {
	collapsed: boolean;
	toggle: () => void;
	toggleClass: string;
};

let sidebar = $state<Sidebar | null>(null);

export function isMapOverlayHeader(
	url: URL,
	projectSlug?: string,
): boolean {
	if (url.pathname === "/") return true;
	if (!projectSlug || url.pathname !== `/${projectSlug}/layers`) return false;
	const v = url.searchParams.get("view") ?? "";
	return v !== "table" && v !== "schema";
}

export const headerChrome = {
	get sidebar() {
		return sidebar;
	},
	setSidebar(next: Sidebar | null) {
		sidebar = next;
	},
};
