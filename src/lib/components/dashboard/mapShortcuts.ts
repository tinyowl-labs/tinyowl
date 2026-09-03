/** Shared keyboard shortcuts for LayerScene tool rails. */

import { searchOverlay } from "$lib/stores/searchOverlay.svelte";
import type { MeasureMode } from "$lib/measure";
import type { SelectionToolMode } from "$lib/stores/layerSelection.svelte";

export type MapShortcutAction =
	| { type: "escape" }
	| { type: "enter" }
	| { type: "undo" }
	| { type: "fly-to" }
	| { type: "home" }
	| { type: "isolate" }
	| { type: "exit-isolate" }
	| { type: "select-tool"; mode: SelectionToolMode }
	| { type: "measure-toggle" }
	| { type: "measure-mode"; mode: MeasureMode }
	| { type: "comments-toggle" }
	| { type: "edit-toggle" }
	| { type: "delete-feature" };

export function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	if (el.isContentEditable) return true;
	const tag = el.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	return Boolean(el.closest?.("input, textarea, select, [contenteditable=true]"));
}

/**
 * Map a keydown to a tool action. Returns null when the event should be ignored.
 * Does not call preventDefault — callers decide.
 */
export function mapToolShortcut(ev: KeyboardEvent): MapShortcutAction | null {
	if (searchOverlay.open) return null;
	if (isTypingTarget(ev.target)) return null;

	const chord = ev.metaKey || ev.ctrlKey;
	if (chord && !ev.altKey && (ev.key === "z" || ev.key === "Z")) {
		if (ev.shiftKey) return null;
		return { type: "undo" };
	}

	if (ev.metaKey || ev.ctrlKey || ev.altKey) return null;

	if (ev.key === "Escape") return { type: "escape" };
	if (ev.key === "Enter") return { type: "enter" };
	if (ev.key === "Tab") {
		if (ev.shiftKey) return null;
		return { type: "edit-toggle" };
	}
	if (ev.key === "Delete" || ev.key === "Backspace") {
		return { type: "delete-feature" };
	}

	const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
	switch (k) {
		case "f":
			return { type: "fly-to" };
		case "h":
			return { type: "home" };
		case "i":
			return { type: "isolate" };
		case "u":
			return { type: "exit-isolate" };
		case "1":
			return { type: "select-tool", mode: "click" };
		case "2":
			return { type: "select-tool", mode: "box" };
		case "3":
			return { type: "select-tool", mode: "lasso" };
		case "m":
			return { type: "measure-toggle" };
		case "c":
			return { type: "comments-toggle" };
		case "p":
			return { type: "measure-mode", mode: "point" };
		case "l":
			return { type: "measure-mode", mode: "length" };
		case "a":
			return { type: "measure-mode", mode: "area" };
		default:
			return null;
	}
}
