/** Generic instance graph: relationship + organize-by + group-by over GPKG rows. */

import {
	lookupLabel,
	tableKind,
	type SchemaFieldEdge,
	type SchemaTableKind,
} from "../project/schemaFields";

export const ORGANIZE_TOPO = "__topo__";

export type EntityRelation = {
	source_type: string;
	source_id: string;
	predicate: string;
	target_type: string;
	target_id: string;
};

export type RelationshipOption = {
	id: string;
	kind: "fk" | "junction" | "relations";
	label: string;
	/** Node table this option is offered for (source / fact). */
	table: string;
	sourceColumn?: string;
	targetTable?: string;
	junctionTable?: string;
	predicate?: string;
	allowMulti?: boolean;
};

export type GraphNode = {
	id: string;
	table: string;
	label: string;
	/** Parsed organize value; missing stays null (sparse). */
	organize: number | null;
	group: string;
};

export type GraphEdge = {
	from: string;
	to: string;
};

export type LayoutNode = GraphNode & {
	x: number;
	y: number;
	w: number;
	h: number;
};

export type LayoutEdge = GraphEdge & {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	via?: { x: number; y: number }[];
};

export type LayoutBand = {
	id: string;
	label: string;
	top: number;
	bottom: number;
};

export type GraphLayout = {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	bands: LayoutBand[];
	width: number;
	height: number;
};

export type GraphBindings = {
	table: string;
	relationship: string;
	organizeBy: string;
	groupBy: string;
	/** Session filter: keep rows of `table` whose column equals this value. */
	filterBy?: string;
	filterValue?: string;
};

const NODE_H = 28;
const H_GAP = 28;
const RANK_GAP = 92;
const ROW_GAP = 10;
const DUMMY_W = 8;
const DUMMY_TABLE = "__dummy";
/** Spread multiple edges across a node instead of stacking them on the centre. */
const PORT_SPAN = 0.55;
const MARGIN = 36;
const BAND_PAD = 14;
const BAND_GAP = 36;
const MIN_NODE_W = 96;
const CHAR_W = 7.2;
/** Cap a rank's packed width so many-to-few FKs don't become a horizontal hairball. */
const WRAP_WIDTH = 920;
const ISOLATE_GAP = 56;

function rowIdentity(row: Record<string, unknown> | undefined): string {
	if (!row) return "";
	const v = row.source_id ?? row.SOURCE_ID;
	return v == null || v === "" ? "" : String(v).trim();
}

function rowValue(
	row: Record<string, unknown> | undefined,
	col: string,
): unknown {
	if (!row || !col) return undefined;
	if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
	const lower = col.toLowerCase();
	for (const [k, v] of Object.entries(row)) {
		if (k.toLowerCase() === lower) return v;
	}
	return undefined;
}

function cellIds(raw: unknown, allowMulti = false): string[] {
	if (raw == null || raw === "") return [];
	if (Array.isArray(raw)) return raw.flatMap((v) => cellIds(v, true));
	if (typeof raw === "number" || typeof raw === "boolean") return [String(raw)];
	const s = String(raw).trim();
	if (!s) return [];
	if (s.startsWith("[")) {
		try {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed)) return cellIds(parsed, true);
		} catch {
			/* fall through */
		}
	}
	const wrapped = s.startsWith("{") && s.endsWith("}") && !s.startsWith('{"');
	if (allowMulti || wrapped || s.includes(",") || s.includes(";")) {
		const inner = wrapped ? s.slice(1, -1) : s;
		return inner
			.split(/[,;]/)
			.map((t) => t.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	return [s];
}

function isSkippedColumn(name: string): boolean {
	return /^_/.test(name) || /^_?geom/i.test(name) || /^source_id$/i.test(name);
}

function parseOrganize(raw: unknown): number | null {
	if (raw == null || raw === "") return null;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	if (typeof raw === "boolean") return raw ? 1 : 0;
	const s = String(raw).trim();
	if (!s) return null;
	const n = Number(s);
	if (Number.isFinite(n) && s !== "") return n;
	const t = Date.parse(s);
	if (Number.isFinite(t)) return t;
	return null;
}

export function nodeKey(table: string, id: string): string {
	return `${table}:${id}`;
}

export function splitNodeKey(key: string): { table: string; id: string } {
	const i = key.indexOf(":");
	if (i <= 0) return { table: "", id: key };
	return { table: key.slice(0, i), id: key.slice(i + 1) };
}

export function nodeTables(
	schemaTables: SchemaTableKind[],
	rowTables: string[],
): SchemaTableKind[] {
	const byName = new Map<string, SchemaTableKind>();
	for (const t of schemaTables) {
		if (tableKind(t) === "junction") continue;
		byName.set(t.name, t);
	}
	for (const name of rowTables) {
		if (!name || byName.has(name)) continue;
		byName.set(name, { name });
	}
	return [...byName.values()].sort((a, b) =>
		(a.label || a.name).localeCompare(b.label || b.name, undefined, {
			numeric: true,
			sensitivity: "base",
		}),
	);
}

function tableTouches(
	optionTable: string,
	selected: string,
): boolean {
	return optionTable.toLowerCase() === selected.toLowerCase();
}

/** Relationships that can bind the selected table (FK, junction, _relations). */
export function relationshipOptions(opts: {
	table: string;
	schemaTables: SchemaTableKind[];
	schemaEdges: SchemaFieldEdge[];
	relations?: EntityRelation[];
}): RelationshipOption[] {
	const table = opts.table.trim();
	if (!table) return [];
	const out: RelationshipOption[] = [];

	const seen = new Set<string>();
	for (const e of opts.schemaEdges) {
		if ((e.kind ?? "fk") !== "fk") continue;
		if (!tableTouches(e.source, table) && !tableTouches(e.target, table)) {
			continue;
		}
		const src = e.source;
		const col = e.source_column;
		const target = e.target ?? "";
		if (!src || !col) continue;
		const id = `fk:${src}:${col}:${target}`;
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({
			id,
			kind: "fk",
			label: `${src}.${col} → ${target}`,
			table: src,
			sourceColumn: col,
			targetTable: target,
			allowMulti: Boolean(e.allow_multi),
		});
	}

	for (const jt of opts.schemaTables) {
		if (tableKind(jt) !== "junction") continue;
		const cols = (jt.columns ?? []).map((c) => c.name.toLowerCase());
		if (!cols.includes("from_id") && !cols.includes("to_id")) continue;
		const prefix = `${table}_`;
		const name = jt.name;
		const hangsOff =
			name.toLowerCase().startsWith(prefix.toLowerCase()) ||
			name.toLowerCase().includes(`_${table.toLowerCase()}`) ||
			cols.includes("from_id");
		if (!hangsOff) continue;
		out.push({
			id: `junction:${name}`,
			kind: "junction",
			label: name,
			table,
			junctionTable: name,
		});
	}

	const seenPred = new Set<string>();
	for (const rel of opts.relations ?? []) {
		const pred = (rel.predicate ?? "").trim();
		if (!pred) continue;
		const src = (rel.source_type ?? "").trim();
		const tgt = (rel.target_type ?? "").trim();
		if (!tableTouches(src, table) && !tableTouches(tgt, table)) continue;
		const id = `relations:${pred}`;
		if (seenPred.has(id)) continue;
		seenPred.add(id);
		out.push({
			id,
			kind: "relations",
			label: `_relations · ${pred}`,
			table,
			predicate: pred,
		});
	}

	return out;
}

export function parseRelationshipId(id: string): {
	kind: RelationshipOption["kind"] | "";
	rest: string[];
} {
	if (!id) return { kind: "", rest: [] };
	const [kind, ...rest] = id.split(":");
	if (kind === "fk" || kind === "junction" || kind === "relations") {
		return { kind, rest };
	}
	return { kind: "", rest: [] };
}

export function columnNames(
	table: SchemaTableKind | undefined,
	rows: Record<string, unknown>[] | undefined,
): string[] {
	const names = new Set<string>();
	for (const c of table?.columns ?? []) {
		if (c.name && !isSkippedColumn(c.name)) names.add(c.name);
	}
	for (const row of rows ?? []) {
		for (const k of Object.keys(row)) {
			if (!isSkippedColumn(k)) names.add(k);
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

export function orderedColumns(
	rows: Record<string, unknown>[] | undefined,
	columns: string[],
): string[] {
	const sample = rows ?? [];
	return columns.filter((col) => {
		let hits = 0;
		for (const row of sample) {
			if (parseOrganize(rowValue(row, col)) != null) hits += 1;
			if (hits >= 2) return true;
		}
		return false;
	});
}

/** Distinct non-empty values for a session filter picker. */
export function distinctColumnValues(
	rows: Record<string, unknown>[] | undefined,
	column: string,
): string[] {
	if (!column) return [];
	const seen = new Set<string>();
	for (const row of rows ?? []) {
		const raw = rowValue(row, column);
		if (raw == null) continue;
		const s = String(raw).trim();
		if (s) seen.add(s);
	}
	return [...seen].sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
	);
}

function addNode(
	nodes: Map<string, GraphNode>,
	table: string,
	id: string,
	rowsByTable: Record<string, Record<string, unknown>[]>,
	organizeBy: string,
	groupBy: string,
) {
	const key = nodeKey(table, id);
	if (!id || nodes.has(key)) return;
	const row = (rowsByTable[table] ?? []).find((r) => rowIdentity(r) === id);
	const label = lookupLabel(row, id);
	const organize =
		organizeBy && organizeBy !== ORGANIZE_TOPO
			? parseOrganize(rowValue(row, organizeBy))
			: null;
	const graw = groupBy ? rowValue(row, groupBy) : "";
	const group =
		graw == null || String(graw).trim() === "" ? "" : String(graw).trim();
	nodes.set(key, { id, table, label, organize, group });
}

function collectTableIds(
	table: string,
	rowsByTable: Record<string, Record<string, unknown>[]>,
): string[] {
	const ids: string[] = [];
	for (const row of rowsByTable[table] ?? []) {
		const id = rowIdentity(row);
		if (id) ids.push(id);
	}
	return ids;
}

/** Build nodes + directed edges from current bindings. Sparse tables stay valid. */
export function buildInstanceGraph(opts: {
	bindings: GraphBindings;
	schemaTables: SchemaTableKind[];
	schemaEdges: SchemaFieldEdge[];
	rowsByTable: Record<string, Record<string, unknown>[]>;
	relations?: EntityRelation[];
}): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const table = opts.bindings.table.trim();
	const filterBy = (opts.bindings.filterBy ?? "").trim();
	const filterValue = (opts.bindings.filterValue ?? "").trim();
	const nodes = new Map<string, GraphNode>();
	const edgeSet = new Map<string, GraphEdge>();
	const rowAllowed = (tbl: string, id: string): boolean => {
		if (!filterBy || !filterValue) return true;
		if (tbl.toLowerCase() !== table.toLowerCase()) return true;
		const row = (opts.rowsByTable[tbl] ?? []).find((r) => rowIdentity(r) === id);
		const raw = rowValue(row, filterBy);
		return String(raw ?? "").trim() === filterValue;
	};
	const addEdge = (fromTable: string, fromId: string, toTable: string, toId: string) => {
		if (!fromId || !toId) return;
		if (!rowAllowed(fromTable, fromId) || !rowAllowed(toTable, toId)) return;
		addNode(
			nodes,
			fromTable,
			fromId,
			opts.rowsByTable,
			opts.bindings.organizeBy,
			opts.bindings.groupBy,
		);
		addNode(
			nodes,
			toTable,
			toId,
			opts.rowsByTable,
			opts.bindings.organizeBy,
			opts.bindings.groupBy,
		);
		const from = nodeKey(fromTable, fromId);
		const to = nodeKey(toTable, toId);
		if (from === to) return;
		const id = `${from}|${to}`;
		if (!edgeSet.has(id)) edgeSet.set(id, { from, to });
	};

	if (table) {
		for (const id of collectTableIds(table, opts.rowsByTable)) {
			if (!rowAllowed(table, id)) continue;
			addNode(
				nodes,
				table,
				id,
				opts.rowsByTable,
				opts.bindings.organizeBy,
				opts.bindings.groupBy,
			);
		}
	}

	const relId = opts.bindings.relationship;
	const parsed = parseRelationshipId(relId);
	if (parsed.kind === "fk") {
		const srcTable = parsed.rest[0] ?? "";
		const targetHint =
			parsed.rest.length >= 3 ? parsed.rest[parsed.rest.length - 1] : "";
		const col =
			parsed.rest.length >= 3
				? parsed.rest.slice(1, -1).join(":")
				: parsed.rest.slice(1).join(":");
		const edge = opts.schemaEdges.find(
			(e) =>
				(e.kind ?? "fk") === "fk" &&
				e.source === srcTable &&
				e.source_column === col &&
				(!targetHint || e.target === targetHint),
		);
		const targetTable = edge?.target ?? targetHint ?? table;
		const allowMulti = Boolean(edge?.allow_multi);
		for (const row of opts.rowsByTable[srcTable] ?? []) {
			const fromId = rowIdentity(row);
			for (const toId of cellIds(rowValue(row, col), allowMulti)) {
				addEdge(srcTable, fromId, targetTable, toId);
			}
		}
	} else if (parsed.kind === "junction") {
		const jname = parsed.rest.join(":");
		const fact = table || guessJunctionFact(jname, opts.schemaTables);
		const other = junctionTargetTable(jname, fact, opts.schemaTables);
		for (const row of opts.rowsByTable[jname] ?? []) {
			const fromId = String(row.from_id ?? row.FROM_ID ?? "").trim();
			const toId = String(row.to_id ?? row.TO_ID ?? "").trim();
			addEdge(fact, fromId, other, toId);
		}
	} else if (parsed.kind === "relations") {
		const pred = parsed.rest.join(":");
		for (const rel of opts.relations ?? []) {
			if ((rel.predicate ?? "").trim() !== pred) continue;
			const st = (rel.source_type ?? "").trim();
			const tt = (rel.target_type ?? "").trim();
			const sid = (rel.source_id ?? "").trim();
			const tid = (rel.target_id ?? "").trim();
			if (!st || !tt || !sid || !tid) continue;
			addEdge(st, sid, tt, tid);
		}
	}

	return { nodes: [...nodes.values()], edges: [...edgeSet.values()] };
}

function guessJunctionFact(
	junctionName: string,
	schemaTables: SchemaTableKind[],
): string {
	const lower = junctionName.toLowerCase();
	for (const t of schemaTables) {
		if (tableKind(t) === "junction") continue;
		if (lower.startsWith(`${t.name.toLowerCase()}_`)) return t.name;
	}
	const i = junctionName.indexOf("_");
	return i > 0 ? junctionName.slice(0, i) : junctionName;
}

function junctionTargetTable(
	junctionName: string,
	factTable: string,
	schemaTables: SchemaTableKind[],
): string {
	const prefix = `${factTable}_`;
	if (junctionName.toLowerCase().startsWith(prefix.toLowerCase())) {
		const suffix = junctionName.slice(prefix.length);
		const hit = schemaTables.find(
			(t) =>
				t.name.toLowerCase() === suffix.toLowerCase() &&
				tableKind(t) !== "junction",
		);
		if (hit) return hit.name;
	}
	return factTable;
}

function longestPathRanks(nodeIds: string[], edges: GraphEdge[]): Map<string, number> {
	const outgoing = new Map<string, string[]>();
	const indeg = new Map<string, number>();
	for (const id of nodeIds) {
		outgoing.set(id, []);
		indeg.set(id, 0);
	}
	for (const e of edges) {
		if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
		outgoing.get(e.from)!.push(e.to);
		indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
	}
	const rank = new Map<string, number>();
	for (const id of nodeIds) rank.set(id, 0);
	const pending = new Map(indeg);
	const queue: string[] = [];
	for (const id of nodeIds) {
		if ((pending.get(id) ?? 0) === 0) queue.push(id);
	}
	const seen = new Set<string>();
	while (queue.length) {
		const u = queue.shift()!;
		if (seen.has(u)) continue;
		seen.add(u);
		const ru = rank.get(u) ?? 0;
		for (const v of outgoing.get(u) ?? []) {
			rank.set(v, Math.max(rank.get(v) ?? 0, ru + 1));
			const next = (pending.get(v) ?? 1) - 1;
			pending.set(v, next);
			if (next === 0) queue.push(v);
		}
	}
	return rank;
}

function columnRanks(nodes: GraphNode[]): Map<string, number> {
	const keys = nodes.map((n) => nodeKey(n.table, n.id));
	const values = nodes.map((n) => n.organize);
	const unique = [
		...new Set(values.filter((v): v is number => v != null)),
	].sort((a, b) => b - a);
	const rankOf = new Map<number, number>();
	unique.forEach((v, i) => rankOf.set(v, i));
	const ranks = new Map<string, number>();
	const bottom = unique.length;
	keys.forEach((k, i) => {
		const v = values[i];
		ranks.set(k, v == null ? bottom : (rankOf.get(v) ?? bottom));
	});
	return ranks;
}

function nodeWidth(label: string): number {
	return Math.max(MIN_NODE_W, Math.ceil(label.length * CHAR_W + 24));
}

function barycentricOrder(
	ranks: Map<string, number>,
	edges: GraphEdge[],
	seed: string[],
): string[][] {
	const maxRank = Math.max(0, ...ranks.values());
	const layers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
	for (const id of seed) {
		const r = ranks.get(id) ?? 0;
		layers[r]?.push(id);
	}
	const pos = new Map<string, number>();
	const reindex = () => {
		pos.clear();
		for (const layer of layers) {
			layer.forEach((id, i) => pos.set(id, i));
		}
	};
	reindex();
	const neighbors = (id: string, dir: "up" | "down"): string[] => {
		const out: string[] = [];
		for (const e of edges) {
			if (dir === "down" && e.from === id) out.push(e.to);
			if (dir === "up" && e.to === id) out.push(e.from);
		}
		return out;
	};
	const sortLayer = (layer: string[], dir: "up" | "down") => {
		layer.sort((a, b) => {
			const na = neighbors(a, dir);
			const nb = neighbors(b, dir);
			const ba =
				na.length === 0
					? (pos.get(a) ?? 0)
					: na.reduce((s, n) => s + (pos.get(n) ?? 0), 0) / na.length;
			const bb =
				nb.length === 0
					? (pos.get(b) ?? 0)
					: nb.reduce((s, n) => s + (pos.get(n) ?? 0), 0) / nb.length;
			return ba - bb || a.localeCompare(b);
		});
	};
	for (let pass = 0; pass < 8; pass++) {
		for (let r = 1; r < layers.length; r++) sortLayer(layers[r]!, "up");
		reindex();
		for (let r = layers.length - 2; r >= 0; r--) sortLayer(layers[r]!, "down");
		reindex();
	}
	if (seed.length <= 180 && edges.length <= 800) {
		transposeReduce(layers, edges);
	}
	return layers;
}

function dummyKey(from: string, to: string, rank: number): string {
	return `__d:${from}|${to}:${rank}`;
}

function graphKey(n: { table: string; id: string }): string {
	return n.table === DUMMY_TABLE ? n.id : nodeKey(n.table, n.id);
}

function layerCrossings(
	upper: string[],
	lower: string[],
	edges: GraphEdge[],
): number {
	const pu = new Map(upper.map((id, i) => [id, i]));
	const pl = new Map(lower.map((id, i) => [id, i]));
	const segs: [number, number][] = [];
	for (const e of edges) {
		let u = pu.get(e.from);
		let v = pl.get(e.to);
		if (u == null || v == null) {
			u = pu.get(e.to);
			v = pl.get(e.from);
		}
		if (u == null || v == null) continue;
		segs.push([u, v]);
	}
	let n = 0;
	for (let i = 0; i < segs.length; i++) {
		for (let j = i + 1; j < segs.length; j++) {
			const a = segs[i]!;
			const b = segs[j]!;
			if ((a[0] - b[0]) * (a[1] - b[1]) < 0) n += 1;
		}
	}
	return n;
}

/** Adjacent swaps that cut crossings (Sugiyama transpose). */
function transposeReduce(layers: string[][], edges: GraphEdge[]) {
	for (let pass = 0; pass < 12; pass++) {
		let moved = false;
		for (let r = 0; r < layers.length; r++) {
			const layer = layers[r]!;
			const left = r > 0 ? layers[r - 1]! : [];
			const right = r + 1 < layers.length ? layers[r + 1]! : [];
			for (let i = 0; i < layer.length - 1; i++) {
				const before =
					layerCrossings(left, layer, edges) +
					layerCrossings(layer, right, edges);
				const tmp = layer[i]!;
				layer[i] = layer[i + 1]!;
				layer[i + 1] = tmp;
				const after =
					layerCrossings(left, layer, edges) +
					layerCrossings(layer, right, edges);
				if (after < before) {
					moved = true;
				} else {
					layer[i + 1] = layer[i]!;
					layer[i] = tmp;
				}
			}
		}
		if (!moved) break;
	}
}

/** Split long-span edges so they take a waypoint on each skipped rank. */
function insertDummies(
	ranks: Map<string, number>,
	edges: GraphEdge[],
	byKey: Map<string, GraphNode>,
): { edges: GraphEdge[]; dummyKeys: string[] } {
	const dummyKeys: string[] = [];
	const next: GraphEdge[] = [];
	const maxRank = Math.max(0, ...ranks.values());
	for (const e of edges) {
		const rf = ranks.get(e.from);
		const rt = ranks.get(e.to);
		if (rf == null || rt == null || rf === rt || Math.abs(rt - rf) === 1) {
			next.push(e);
			continue;
		}
		const step = rt > rf ? 1 : -1;
		let prev = e.from;
		for (let r = rf + step; r !== rt; r += step) {
			if (r < 0 || r > maxRank) break;
			const key = dummyKey(e.from, e.to, r);
			if (!ranks.has(key)) {
				ranks.set(key, r);
				dummyKeys.push(key);
				byKey.set(key, {
					id: key,
					table: DUMMY_TABLE,
					label: "",
					organize: null,
					group: "",
				});
			}
			next.push({ from: prev, to: key });
			prev = key;
		}
		next.push({ from: prev, to: e.to });
	}
	return { edges: next, dummyKeys };
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Per-node x from neighbour medians, then pack so boxes don't overlap.
 * Preserves layer order so this cannot reintroduce crossings.
 */
function placeLayerXs(
	laid: Map<string, LayoutNode>,
	layers: string[][],
	edges: GraphEdge[],
) {
	const nbrX = (id: string): number[] => {
		const xs: number[] = [];
		for (const e of edges) {
			const other = e.from === id ? e.to : e.to === id ? e.from : "";
			if (!other) continue;
			const n = laid.get(other);
			if (n) xs.push(n.x);
		}
		return xs;
	};
	for (let pass = 0; pass < 6; pass++) {
		for (const layer of layers) {
			if (layer.length === 0) continue;
			const desired = layer.map((id) => {
				const xs = nbrX(id);
				const cur = laid.get(id);
				if (!cur) return 0;
				return xs.length ? median(xs) : cur.x;
			});
			let right = Number.NEGATIVE_INFINITY;
			for (let i = 0; i < layer.length; i++) {
				const node = laid.get(layer[i]!);
				if (!node) continue;
				let x = desired[i]!;
				const minX = right + H_GAP + node.w / 2;
				if (Number.isFinite(right) && x < minX) x = minX;
				node.x = x;
				right = x + node.w / 2;
			}
		}
	}
}

function linkedKeys(keys: string[], edges: GraphEdge[]): Set<string> {
	const live = new Set<string>();
	const have = new Set(keys);
	for (const e of edges) {
		if (have.has(e.from)) live.add(e.from);
		if (have.has(e.to)) live.add(e.to);
	}
	return live;
}

function packLayer(
	ids: string[],
	byKey: Map<string, GraphNode>,
	originX: number,
	originY: number,
): { placed: LayoutNode[]; width: number; height: number; cols: number } {
	if (ids.length === 0) {
		return { placed: [], width: 0, height: 0, cols: 0 };
	}
	const widths = ids.map((id) => {
		const src = byKey.get(id);
		if (src?.table === DUMMY_TABLE) return DUMMY_W;
		return nodeWidth(src?.label ?? id);
	});
	const cellW = Math.max(DUMMY_W, ...widths) + H_GAP;
	const cols = Math.max(
		1,
		Math.min(ids.length, Math.floor((WRAP_WIDTH + H_GAP) / cellW)),
	);
	const placed: LayoutNode[] = [];
	ids.forEach((id, i) => {
		const src = byKey.get(id);
		if (!src) return;
		const w = src.table === DUMMY_TABLE ? DUMMY_W : nodeWidth(src.label);
		const col = i % cols;
		const row = Math.floor(i / cols);
		placed.push({
			...src,
			x: originX + col * cellW + w / 2,
			y: originY + row * (NODE_H + ROW_GAP),
			w,
			h: NODE_H,
		});
	});
	const rows = Math.ceil(ids.length / cols);
	return {
		placed,
		width: cols * cellW - H_GAP,
		height: rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP,
		cols,
	};
}

function snapOneToOne(
	nodes: Map<string, LayoutNode>,
	edges: GraphEdge[],
) {
	const outDeg = new Map<string, number>();
	const inDeg = new Map<string, number>();
	for (const e of edges) {
		outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
		inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
	}
	for (let i = 0; i < 16; i++) {
		let moved = false;
		for (const e of edges) {
			if ((outDeg.get(e.from) ?? 0) !== 1) continue;
			if ((inDeg.get(e.to) ?? 0) !== 1) continue;
			const a = nodes.get(e.from);
			const b = nodes.get(e.to);
			if (!a || !b) continue;
			const x = (a.x + b.x) / 2;
			if (Math.abs(a.x - x) > 0.5 || Math.abs(b.x - x) > 0.5) {
				a.x = x;
				b.x = x;
				moved = true;
			}
		}
		if (!moved) break;
	}
}

function packBands(
	laid: LayoutNode[],
	groupOrder: string[],
): { nodes: LayoutNode[]; bands: LayoutBand[] } {
	if (groupOrder.length === 0) return { nodes: laid, bands: [] };
	const byGroup = new Map<string, LayoutNode[]>();
	for (const n of laid) {
		const g = n.group;
		let list = byGroup.get(g);
		if (!list) {
			list = [];
			byGroup.set(g, list);
		}
		list.push(n);
	}
	const bands: LayoutBand[] = [];
	let cursor = MARGIN;
	const next: LayoutNode[] = [];
	for (const gid of groupOrder) {
		const members = byGroup.get(gid);
		if (!members || members.length === 0) continue;
		const ys = members.map((m) => m.y);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const span = Math.max(NODE_H, maxY - minY);
		const top = cursor;
		const usableTop = top + BAND_PAD;
		for (const m of members) {
			next.push({ ...m, y: usableTop + (m.y - minY) });
		}
		const bottom = usableTop + span + BAND_PAD;
		bands.push({
			id: gid || "__none__",
			label: gid || "—",
			top,
			bottom,
		});
		cursor = bottom + BAND_GAP;
	}
	return { nodes: next, bands };
}

export function layoutInstanceGraph(
	nodes: GraphNode[],
	edges: GraphEdge[],
	opts: { organizeBy: string; groupBy: string },
): GraphLayout {
	if (nodes.length === 0) {
		return { nodes: [], edges: [], bands: [], width: 320, height: 200 };
	}
	const keys = nodes.map((n) => nodeKey(n.table, n.id));
	const byKey = new Map(nodes.map((n) => [nodeKey(n.table, n.id), n]));
	const live = linkedKeys(keys, edges);
	const parkIsolates = opts.organizeBy === ORGANIZE_TOPO || !opts.organizeBy;
	const isolates = parkIsolates
		? keys
				.filter((k) => !live.has(k))
				.sort((a, b) =>
					(byKey.get(a)?.label ?? a).localeCompare(byKey.get(b)?.label ?? b),
				)
		: [];
	const core = parkIsolates ? keys.filter((k) => live.has(k)) : keys;

	if (core.length === 0) {
		const pack = packLayer(keys, byKey, MARGIN, MARGIN);
		return finishLayout(pack.placed, [], edges, new Map(), new Map());
	}

	const ranks =
		opts.organizeBy === ORGANIZE_TOPO
			? longestPathRanks(core, edges)
			: opts.organizeBy
				? columnRanks(
						core
							.map((k) => byKey.get(k))
							.filter((n): n is GraphNode => n != null),
					)
				: new Map(core.map((k) => [k, 0]));

	const routed = insertDummies(ranks, edges, byKey);
	const layers = barycentricOrder(ranks, routed.edges, [
		...core,
		...routed.dummyKeys,
	]);
	const laid = new Map<string, LayoutNode>();
	let y = MARGIN;
	let wrapped = false;
	for (const layer of layers) {
		if (layer.length === 0) continue;
		const pack = packLayer(layer, byKey, MARGIN, y);
		if (pack.cols > 1 && pack.height > NODE_H + 1) wrapped = true;
		for (const n of pack.placed) laid.set(graphKey(n), n);
		y += pack.height + RANK_GAP;
	}
	if (!wrapped) {
		placeLayerXs(laid, layers, routed.edges);
		snapOneToOne(laid, routed.edges);
		placeLayerXs(laid, layers, routed.edges);
	}

	if (isolates.length > 0) {
		let maxX = MARGIN;
		for (const n of laid.values()) maxX = Math.max(maxX, n.x + n.w / 2);
		const pack = packLayer(isolates, byKey, maxX + ISOLATE_GAP, MARGIN);
		for (const n of pack.placed) laid.set(graphKey(n), n);
	}

	let groupOrder: string[] = [];
	if (opts.groupBy) {
		const med = new Map<string, { sum: number; n: number }>();
		for (const n of laid.values()) {
			if (n.table === DUMMY_TABLE) continue;
			const g = n.group;
			const rec = med.get(g) ?? { sum: 0, n: 0 };
			rec.sum += n.y;
			rec.n += 1;
			med.set(g, rec);
		}
		groupOrder = [...med.entries()]
			.sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)
			.map(([g]) => g);
	}
	const dummyX = new Map<string, number>();
	const real: LayoutNode[] = [];
	for (const [key, n] of laid) {
		if (n.table === DUMMY_TABLE) dummyX.set(key, n.x);
		else real.push(n);
	}
	const packed = packBands(real, groupOrder);
	return finishLayout(packed.nodes, packed.bands, edges, dummyX, ranks);
}

function portOffsets(count: number, span: number): number[] {
	if (count <= 1) return [0];
	const step = span / (count + 1);
	return Array.from({ length: count }, (_, i) => (i + 1) * step - span / 2);
}

function spreadPorts(edges: LayoutEdge[], pos: Map<string, LayoutNode>) {
	const outgoing = new Map<string, LayoutEdge[]>();
	const incoming = new Map<string, LayoutEdge[]>();
	for (const e of edges) {
		let out = outgoing.get(e.from);
		if (!out) {
			out = [];
			outgoing.set(e.from, out);
		}
		out.push(e);
		let inn = incoming.get(e.to);
		if (!inn) {
			inn = [];
			incoming.set(e.to, inn);
		}
		inn.push(e);
	}
	for (const [key, list] of outgoing) {
		const node = pos.get(key);
		if (!node || list.length < 2) continue;
		list.sort((a, b) => a.x2 - b.x2 || a.to.localeCompare(b.to));
		const offs = portOffsets(list.length, node.w * PORT_SPAN);
		list.forEach((e, i) => {
			e.x1 = node.x + (offs[i] ?? 0);
		});
	}
	for (const [key, list] of incoming) {
		const node = pos.get(key);
		if (!node || list.length < 2) continue;
		list.sort((a, b) => a.x1 - b.x1 || a.from.localeCompare(b.from));
		const offs = portOffsets(list.length, node.w * PORT_SPAN);
		list.forEach((e, i) => {
			e.x2 = node.x + (offs[i] ?? 0);
		});
	}
}

function finishLayout(
	placed: LayoutNode[],
	bands: LayoutBand[],
	edges: GraphEdge[],
	dummyX: Map<string, number>,
	ranks: Map<string, number>,
): GraphLayout {
	const pos = new Map(placed.map((n) => [graphKey(n), n]));
	const layoutEdges: LayoutEdge[] = [];
	for (const e of edges) {
		const a = pos.get(e.from);
		const b = pos.get(e.to);
		if (!a || !b) continue;
		const dy = b.y - a.y;
		const sameRank = Math.abs(dy) < NODE_H * 0.75;
		const y1 = sameRank ? a.y : a.y + a.h / 2;
		const y2 = sameRank ? b.y : b.y - b.h / 2;
		const rf = ranks.get(e.from);
		const rt = ranks.get(e.to);
		const via: { x: number; y: number }[] = [];
		if (rf != null && rt != null && Math.abs(rt - rf) > 1) {
			const step = rt > rf ? 1 : -1;
			for (let r = rf + step; r !== rt; r += step) {
				const x = dummyX.get(dummyKey(e.from, e.to, r));
				if (x == null) continue;
				const t = (r - rf) / (rt - rf);
				via.push({ x, y: y1 + t * (y2 - y1) });
			}
		}
		layoutEdges.push({
			from: e.from,
			to: e.to,
			x1: a.x,
			y1,
			x2: b.x,
			y2,
			via: via.length ? via : undefined,
		});
	}
	spreadPorts(layoutEdges, pos);

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const n of placed) {
		minX = Math.min(minX, n.x - n.w / 2);
		maxX = Math.max(maxX, n.x + n.w / 2);
		minY = Math.min(minY, n.y - n.h / 2);
		maxY = Math.max(maxY, n.y + n.h / 2);
	}
	for (const e of layoutEdges) {
		minX = Math.min(minX, e.x1, e.x2);
		maxX = Math.max(maxX, e.x1, e.x2);
		for (const p of e.via ?? []) {
			minX = Math.min(minX, p.x);
			maxX = Math.max(maxX, p.x);
		}
	}
	for (const b of bands) {
		minY = Math.min(minY, b.top);
		maxY = Math.max(maxY, b.bottom);
	}
	if (!Number.isFinite(minX)) {
		minX = 0;
		maxX = 320;
		minY = 0;
		maxY = 200;
	}
	const dx = MARGIN - minX;
	const dy = MARGIN - minY;
	return {
		nodes: placed.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
		edges: layoutEdges.map((e) => ({
			...e,
			x1: e.x1 + dx,
			y1: e.y1 + dy,
			x2: e.x2 + dx,
			y2: e.y2 + dy,
			via: e.via?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
		})),
		bands: bands.map((b) => ({
			...b,
			top: b.top + dy,
			bottom: b.bottom + dy,
		})),
		width: Math.max(320, maxX - minX + MARGIN * 2),
		height: Math.max(200, maxY - minY + MARGIN * 2),
	};
}

function cubicSegment(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): string {
	const dx = x2 - x1;
	const dy = y2 - y1;
	if (Math.abs(dx) < 1.5) {
		return `L ${x2} ${y2}`;
	}
	if (Math.abs(dy) < NODE_H) {
		const bow = Math.max(22, Math.min(72, Math.abs(dx) * 0.18));
		const cy = (y1 + y2) / 2 - bow;
		return `Q ${(x1 + x2) / 2} ${cy}, ${x2} ${y2}`;
	}
	const c1y = y1 + dy * 0.4;
	const c2y = y2 - dy * 0.4;
	return `C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
}

export function edgePath(e: LayoutEdge): string {
	const pts = [
		{ x: e.x1, y: e.y1 },
		...(e.via ?? []),
		{ x: e.x2, y: e.y2 },
	];
	let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1]!;
		const b = pts[i]!;
		d += ` ${cubicSegment(a.x, a.y, b.x, b.y)}`;
	}
	return d;
}
