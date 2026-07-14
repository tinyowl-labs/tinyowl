/** Multi-select + session-hide for Layers map (2D/3D) and table. Keys: `layerName:entityId`. */

export function toSelectionKey(layerName: string, entityId: string): string {
	return `${layerName}:${entityId}`;
}

export function parseSelectionKey(key: string): { layer: string; id: string } {
	const i = key.indexOf(":");
	if (i <= 0) return { layer: "", id: key };
	return { layer: key.slice(0, i), id: key.slice(i + 1) };
}

export type SelectionToolMode = "click" | "box" | "lasso";
export type SelectionOp = "replace" | "add" | "remove";

function resolveLastKey(ids: Iterable<string>): string | null {
	let latest: string | null = null;
	for (const id of ids) latest = id;
	return latest;
}

let selected = $state<Set<string>>(new Set());
let primaryKey = $state<string | null>(null);
let hidden = $state<Set<string>>(new Set());
let toolMode = $state<SelectionToolMode>("click");

export const layerSelection = {
	get selected() {
		return selected;
	},

	get primaryKey() {
		if (primaryKey && selected.has(primaryKey)) return primaryKey;
		return resolveLastKey(selected.values());
	},

	get size() {
		return selected.size;
	},

	get hidden() {
		return hidden;
	},

	get hiddenCount() {
		return hidden.size;
	},

	get toolMode() {
		return toolMode;
	},

	setToolMode(mode: SelectionToolMode) {
		if (toolMode === mode) return;
		toolMode = mode;
	},

	get primaryLayer(): string {
		const k = this.primaryKey;
		return k ? parseSelectionKey(k).layer : "";
	},

	get primaryId(): string {
		const k = this.primaryKey;
		return k ? parseSelectionKey(k).id : "";
	},

	keys(): string[] {
		return Array.from(selected);
	},

	isSelected(layerName: string, entityId: string): boolean {
		return selected.has(toSelectionKey(layerName, entityId));
	},

	isPrimary(layerName: string, entityId: string): boolean {
		return this.primaryKey === toSelectionKey(layerName, entityId);
	},

	isHidden(layerName: string, entityId: string): boolean {
		return hidden.has(toSelectionKey(layerName, entityId));
	},

	selectSingle(layerName: string, entityId: string) {
		const key = toSelectionKey(layerName, entityId);
		if (!entityId) {
			this.clearSelection();
			return;
		}
		if (
			selected.size === 1 &&
			selected.has(key) &&
			primaryKey === key
		) {
			return;
		}
		selected = new Set([key]);
		primaryKey = key;
	},

	addSelection(layerName: string, entityId: string) {
		if (!entityId) return;
		const key = toSelectionKey(layerName, entityId);
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		next.add(key);
		selected = next;
		primaryKey = key;
	},

	removeSelection(layerName: string, entityId: string) {
		const key = toSelectionKey(layerName, entityId);
		if (!selected.has(key)) return;
		const next = new Set(selected);
		next.delete(key);
		selected = next;
		if (primaryKey === key) {
			primaryKey = resolveLastKey(next.values());
		}
	},

	toggleSelection(layerName: string, entityId: string) {
		if (this.isSelected(layerName, entityId)) {
			this.removeSelection(layerName, entityId);
		} else {
			this.addSelection(layerName, entityId);
		}
	},

	clearSelection() {
		if (selected.size === 0) return;
		selected = new Set();
		primaryKey = null;
	},

	setSelection(keys: string[]) {
		const normalized = keys.filter((k) => k.includes(":"));
		selected = new Set(normalized);
		primaryKey = normalized[normalized.length - 1] ?? null;
	},

	/** Batch replace / add / remove for box & lasso. */
	applyOp(keys: string[], op: SelectionOp) {
		const normalized = keys.filter((k) => k.includes(":"));
		if (op === "replace") {
			this.setSelection(normalized);
			return;
		}
		if (op === "add") {
			if (normalized.length === 0) return;
			const next = new Set(selected);
			for (const key of normalized) {
				next.delete(key);
				next.add(key);
			}
			selected = next;
			primaryKey = normalized[normalized.length - 1] ?? primaryKey;
			return;
		}
		if (normalized.length === 0) return;
		const next = new Set(selected);
		for (const key of normalized) next.delete(key);
		selected = next;
		if (!primaryKey || !next.has(primaryKey)) {
			primaryKey = resolveLastKey(next.values());
		}
	},

	hideEntity(layerName: string, entityId: string) {
		const key = toSelectionKey(layerName, entityId);
		if (!entityId || hidden.has(key)) return;
		const next = new Set(hidden);
		next.add(key);
		hidden = next;
		if (selected.has(key)) this.removeSelection(layerName, entityId);
	},

	hideSelected() {
		if (selected.size === 0) return;
		const nextHidden = new Set(hidden);
		for (const key of selected) nextHidden.add(key);
		hidden = nextHidden;
		selected = new Set();
		primaryKey = null;
	},

	showEntity(layerName: string, entityId: string) {
		const key = toSelectionKey(layerName, entityId);
		if (!hidden.has(key)) return;
		const next = new Set(hidden);
		next.delete(key);
		hidden = next;
	},

	showSelected() {
		if (selected.size === 0) return;
		const next = new Set(hidden);
		for (const key of selected) next.delete(key);
		hidden = next;
	},

	showAllHidden() {
		if (hidden.size === 0) return;
		hidden = new Set();
	},

	reset() {
		selected = new Set();
		primaryKey = null;
		hidden = new Set();
		toolMode = "click";
	},
};
