import { SHORTCUT_CATALOG } from "./catalog";
import { chordsEqual, eventToChord } from "./chord";
import type { Chord, ShortcutId, ShortcutScope } from "./types";

export function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	if (el.isContentEditable) return true;
	const tag = el.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	return Boolean(el.closest?.("input, textarea, select, [contenteditable=true]"));
}

export type MatchOpts = {
	overrides?: Partial<Record<ShortcutId, Chord>>;
	scopes: ShortcutScope[];
	/** When true, only `global` (search) may match. */
	typing?: boolean;
	overlayOpen?: boolean;
};

export function matchShortcut(
	ev: KeyboardEvent,
	opts: MatchOpts,
): ShortcutId | null {
	if (ev.defaultPrevented && !opts.scopes.includes("global")) return null;
	const chord = eventToChord(ev);
	const typing = opts.typing ?? isTypingTarget(ev.target);

	for (const entry of SHORTCUT_CATALOG) {
		if (!opts.scopes.includes(entry.scope)) continue;
		if (opts.overlayOpen && entry.scope !== "global") continue;
		if (typing && entry.scope !== "global") continue;

		const override = opts.overrides?.[entry.id];
		const candidates = override
			? [override]
			: [entry.defaultChord, ...(entry.aliases ?? [])];
		if (candidates.some((c) => chordsEqual(c, chord))) return entry.id;
	}
	return null;
}
