/** In-project slash filters. `/layer` chips a layer; others switch typeahead kind. */
export const SLASH_KINDS = [
	{
		id: "layer",
		label: "Layer",
		hint: "Search within a layer",
	},
	{
		id: "entity",
		label: "Entity",
		hint: "Find a record by id",
	},
	{
		id: "artefact",
		label: "Artefact",
		hint: "Photos, 3D, and files",
	},
	{
		id: "place",
		label: "Place",
		hint: "Ancient and modern places",
	},
	{
		id: "row",
		label: "Row",
		hint: "Filter by a column — height>50 or description?pottery",
	},
] as const;

export type SlashKindId = (typeof SLASH_KINDS)[number]["id"];

export function isSlashKindId(raw: string): raw is SlashKindId {
	const q = raw.trim().toLowerCase();
	return SLASH_KINDS.some((k) => k.id === q);
}

export function isSlashKindToken(typed: string): boolean {
	const q = typed.trim().toLowerCase();
	if (!q) return false;
	return SLASH_KINDS.some(
		(k) => k.id === q || k.label.toLowerCase() === q,
	);
}

export function displayLayerName(name: string): string {
	return name.replace(/_/g, " ");
}

/** Strip the in-progress `@` / `#` / `/` token from the free-text query. */
export function stripTrailingFilterToken(raw: string): string {
	return raw.replace(/(^|\s)[@#/][^\s]*$/, "$1").trimEnd();
}

/**
 * Harvest `/layer:name` tokens. Completed-only requires a trailing space
 * (same chip rule as `@slug` / `#tag`). Last layer wins — `?layer=` is singular.
 */
export function harvestSlashLayers(
	raw: string,
	opts?: { completedOnly?: boolean },
): { q: string; layers: string[] } {
	const found: string[] = [];
	const keepTrailingSpace = /\s$/.test(raw);
	const re = opts?.completedOnly
		? /(^|\s)\/layer:([^\s]+)(?=\s)/gi
		: /(^|\s)\/layer:([^\s]+)/gi;
	const stripped = raw.replace(
		re,
		(full, lead: string, token: string) => {
			const name = token.trim();
			if (!name || isSlashKindToken(name)) return full;
			const existing = found.findIndex(
				(t) => t.toLowerCase() === name.toLowerCase(),
			);
			if (existing >= 0) found.splice(existing, 1);
			found.push(name);
			return lead;
		},
	);
	let q = stripped.replace(/\s+/g, " ").trim();
	if (keepTrailingSpace && q) q += " ";
	return { q, layers: found };
}

/** Column compare / contains. Not a boolean DSL — chips AND. */
export type RowOp = ">" | "<" | ">=" | "<=" | "=" | "!=" | "?" | "~";

export type RowPredicate = {
	column: string;
	op: RowOp;
	value: string;
};

const ROW_OPS: RowOp[] = [">=", "<=", "!=", ">", "<", "=", "?", "~"];

const COL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ROW_OP_HINTS: { op: RowOp; label: string; hint: string }[] = [
	{ op: ">", label: ">", hint: "Greater than" },
	{ op: "<", label: "<", hint: "Less than" },
	{ op: ">=", label: ">=", hint: "At least" },
	{ op: "<=", label: "<=", hint: "At most" },
	{ op: "=", label: "=", hint: "Equals" },
	{ op: "!=", label: "!=", hint: "Not equal" },
	{ op: "?", label: "?", hint: "Contains" },
];

export function isContainsOp(op: RowOp): boolean {
	return op === "?" || op === "~";
}

export function isNumericRowOp(op: RowOp): boolean {
	return op === ">" || op === "<" || op === ">=" || op === "<=";
}

export function formatRowToken(p: RowPredicate): string {
	return `${p.column}${p.op}${p.value}`;
}

export function formatRowChip(p: RowPredicate): string {
	const op = p.op === "~" ? "?" : p.op;
	return `${displayLayerName(p.column)} ${op} ${p.value}`;
}

/** Parse `height>50` / `description?pottery`. Incomplete drafts allowed. */
export function parseRowDraft(raw: string): {
	column: string;
	op: RowOp | null;
	value: string;
} | null {
	const s = raw.trim();
	if (!s) return null;
	for (const op of ROW_OPS) {
		const i = indexOfOp(s, op);
		if (i <= 0) continue;
		const column = s.slice(0, i);
		if (!COL_RE.test(column)) continue;
		return { column, op, value: s.slice(i + op.length) };
	}
	if (COL_RE.test(s)) return { column: s, op: null, value: "" };
	return null;
}

function indexOfOp(s: string, op: RowOp): number {
	// First occurrence after a valid column prefix.
	let from = 1;
	while (from < s.length) {
		const i = s.indexOf(op, from);
		if (i < 0) return -1;
		if (COL_RE.test(s.slice(0, i))) return i;
		from = i + 1;
	}
	return -1;
}

export function parseRowPredicate(raw: string): RowPredicate | null {
	const d = parseRowDraft(raw);
	if (!d?.op || !d.value) return null;
	return { column: d.column, op: d.op, value: d.value };
}

/**
 * Harvest `/row:height>50` tokens. Completed-only requires a trailing space
 * and a full column+op+value predicate.
 */
export function harvestSlashRows(
	raw: string,
	opts?: { completedOnly?: boolean },
): { q: string; rows: RowPredicate[] } {
	const found: RowPredicate[] = [];
	const keepTrailingSpace = /\s$/.test(raw);
	const re = opts?.completedOnly
		? /(^|\s)\/?row:([^\s]+)(?=\s)/gi
		: /(^|\s)\/?row:([^\s]+)/gi;
	const stripped = raw.replace(
		re,
		(full, lead: string, token: string) => {
			const pred = parseRowPredicate(token);
			if (!pred) return full;
			const key = formatRowToken(pred).toLowerCase();
			if (!found.some((p) => formatRowToken(p).toLowerCase() === key)) {
				found.push(pred);
			}
			return lead;
		},
	);
	let q = stripped.replace(/\s+/g, " ").trim();
	if (keepTrailingSpace && q) q += " ";
	return { q, rows: found };
}

export function mergeRowPredicates(
	base: RowPredicate[],
	more: RowPredicate[],
): RowPredicate[] {
	const out = [...base];
	for (const p of more) {
		const key = formatRowToken(p).toLowerCase();
		if (!out.some((x) => formatRowToken(x).toLowerCase() === key)) {
			out.push(p);
		}
	}
	return out;
}

/** Drop a trailing incomplete `/row:` or `/kind:` draft from leftover q. */
export function stripIncompleteSlashDraft(raw: string): string {
	return raw
		.replace(/(^|\s)\/?row:[^\s]*$/i, "$1")
		.replace(/(^|\s)\/[a-z]*:?$/i, "$1")
		.replace(/\s+/g, " ")
		.trim();
}

