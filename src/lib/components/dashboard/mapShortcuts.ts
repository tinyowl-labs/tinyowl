/** Shared keyboard shortcuts for LayerScene tool rails. */

import { searchOverlay } from "$lib/stores/searchOverlay.svelte";
import type { MeasureMode } from "$lib/measure";
import type { SelectionToolMode } from "$lib/stores/layerSelection.svelte";
import {
	isFlyActive,
	isTypingTarget,
	matchPrefShortcut,
	type ShortcutId,
} from "$lib/shortcuts";

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
	| { type: "add-geometry" }
	| { type: "graph-toggle" }
	| { type: "delete-feature" }
	| { type: "fly-toggle" };

export { isTypingTarget };

const FLY_ALLOWED = new Set<ShortcutId>([
	"map-escape",
	"map-enter",
	"map-fly-toggle",
]);

function actionFromId(id: ShortcutId): MapShortcutAction | null {
	switch (id) {
		case "map-escape":
			return { type: "escape" };
		case "map-enter":
			return { type: "enter" };
		case "map-undo":
			return { type: "undo" };
		case "map-fly-to":
			return { type: "fly-to" };
		case "map-home":
			return { type: "home" };
		case "map-isolate":
			return { type: "isolate" };
		case "map-exit-isolate":
			return { type: "exit-isolate" };
		case "map-select-click":
			return { type: "select-tool", mode: "click" };
		case "map-select-box":
			return { type: "select-tool", mode: "box" };
		case "map-select-lasso":
			return { type: "select-tool", mode: "lasso" };
		case "map-measure-toggle":
			return { type: "measure-toggle" };
		case "map-measure-point":
			return { type: "measure-mode", mode: "point" };
		case "map-measure-length":
			return { type: "measure-mode", mode: "length" };
		case "map-measure-area":
			return { type: "measure-mode", mode: "area" };
		case "map-measure-volume":
			return { type: "measure-mode", mode: "volume" };
		case "map-comments-toggle":
			return { type: "comments-toggle" };
		case "map-edit-toggle":
			return { type: "edit-toggle" };
		case "map-add-geometry":
			return { type: "add-geometry" };
		case "map-graph-toggle":
			return { type: "graph-toggle" };
		case "map-delete":
			return { type: "delete-feature" };
		case "map-fly-toggle":
			return { type: "fly-toggle" };
		default:
			return null;
	}
}

/**
 * Map a keydown to a tool action. Returns null when the event should be ignored.
 * Does not call preventDefault — callers decide.
 */
export function mapToolShortcut(ev: KeyboardEvent): MapShortcutAction | null {
	const id = matchPrefShortcut(ev, ["map"], {
		overlayOpen: searchOverlay.open,
		typing: isTypingTarget(ev.target),
	});
	if (!id) return null;
	if (isFlyActive() && !FLY_ALLOWED.has(id)) return null;
	return actionFromId(id);
}
