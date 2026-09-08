/** Session CRUD edit buffer. Commit goes pending+message — no canonical write. */

import type { DiffOp, EditBufferEntry, GeoJsonGeometry } from "$lib/geoDiff";

export type DrawGeomMode =
	| "Point"
	| "LineString"
	| "Polygon"
	| "MultiPoint"
	| "MultiLineString"
	| "MultiPolygon";

export const DRAW_GEOM_MODES: { id: DrawGeomMode; label: string }[] = [
	{ id: "Point", label: "Point" },
	{ id: "LineString", label: "Line" },
	{ id: "Polygon", label: "Polygon" },
	{ id: "MultiPoint", label: "MultiPoint" },
	{ id: "MultiLineString", label: "MultiLine" },
	{ id: "MultiPolygon", label: "MultiPoly" },
];

let seq = 0;
let entries = $state<EditBufferEntry[]>([]);
let schemaAdds = $state<SchemaAddColumn[]>([]);
let targetLayer = $state<string | null>(null);
let baseCommit = $state("");
let boundSlug = "";
let hydrating = false;

/** Fallback layer name while drawing with no table selected. */
const PLACEHOLDER_TABLE = "_draw";

const SESSION_PREFIX = "echidna:edit-session:";
const SESSION_VERSION = 1;
const OPS = new Set<DiffOp>(["insert", "update", "delete", "head"]);

export type SchemaAddColumn = { table: string; name: string };

function isIdent(name: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function sessionKey(slug: string): string {
	return `${SESSION_PREFIX}${slug}`;
}

function parsePersisted(raw: string): {
	seq: number;
	targetLayer: string | null;
	baseCommit: string;
	entries: EditBufferEntry[];
	schemaAdds: SchemaAddColumn[];
} | null {
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		if (data.v !== SESSION_VERSION || !Array.isArray(data.entries)) return null;
		const next: EditBufferEntry[] = [];
		for (const row of data.entries) {
			if (!row || typeof row !== "object") continue;
			const e = row as Record<string, unknown>;
			const op = e.op;
			const table = typeof e.table === "string" ? e.table : "";
			const entityId = typeof e.entityId === "string" ? e.entityId : "";
			if (!table || !entityId || typeof op !== "string" || !OPS.has(op as DiffOp)) {
				continue;
			}
			const entry: EditBufferEntry = {
				op: op as DiffOp,
				table,
				entityId,
			};
			if ("geometry" in e) entry.geometry = e.geometry;
			if ("oldGeometry" in e) entry.oldGeometry = e.oldGeometry;
			if (e.attributes && typeof e.attributes === "object" && !Array.isArray(e.attributes)) {
				entry.attributes = e.attributes as Record<string, unknown>;
			}
			next.push(entry);
		}
		let nextSeq =
			typeof data.seq === "number" && Number.isFinite(data.seq)
				? Math.max(0, Math.floor(data.seq))
				: 0;
		for (const e of next) {
			const m = /^draft-(\d+)$/.exec(e.entityId);
			if (m) nextSeq = Math.max(nextSeq, Number(m[1]));
		}
		const adds: SchemaAddColumn[] = [];
		if (Array.isArray(data.schemaAdds)) {
			for (const row of data.schemaAdds) {
				if (!row || typeof row !== "object") continue;
				const a = row as Record<string, unknown>;
				const table = typeof a.table === "string" ? a.table.trim() : "";
				const name = typeof a.name === "string" ? a.name.trim() : "";
				if (!table || !isIdent(name)) continue;
				adds.push({ table, name });
			}
		}
		const layer =
			typeof data.targetLayer === "string" && data.targetLayer.trim()
				? data.targetLayer
				: null;
		const base = typeof data.baseCommit === "string" ? data.baseCommit : "";
		return {
			seq: nextSeq,
			targetLayer: layer,
			baseCommit: base,
			entries: next,
			schemaAdds: adds,
		};
	} catch {
		return null;
	}
}

function persist() {
	if (hydrating || !boundSlug) return;
	if (typeof localStorage === "undefined") return;
	try {
		if (entries.length === 0 && schemaAdds.length === 0 && !targetLayer && !baseCommit) {
			localStorage.removeItem(sessionKey(boundSlug));
			return;
		}
		localStorage.setItem(
			sessionKey(boundSlug),
			JSON.stringify({
				v: SESSION_VERSION,
				seq,
				targetLayer,
				baseCommit,
				entries,
				schemaAdds,
			}),
		);
	} catch {
		/* quota / private mode */
	}
}

function loadSlug(slug: string) {
	hydrating = true;
	boundSlug = slug;
	if (!slug || typeof localStorage === "undefined") {
		seq = 0;
		entries = [];
		schemaAdds = [];
		targetLayer = null;
		baseCommit = "";
		hydrating = false;
		return;
	}
	let raw = "";
	try {
		raw = localStorage.getItem(sessionKey(slug)) ?? "";
	} catch {
		raw = "";
	}
	const parsed = raw ? parsePersisted(raw) : null;
	if (!parsed) {
		seq = 0;
		entries = [];
		schemaAdds = [];
		targetLayer = null;
		baseCommit = "";
		hydrating = false;
		return;
	}
	seq = parsed.seq;
	entries = parsed.entries;
	schemaAdds = parsed.schemaAdds;
	targetLayer = parsed.targetLayer;
	baseCommit = parsed.baseCommit;
	hydrating = false;
}

export const editBuffer = {
	get entries(): EditBufferEntry[] {
		return entries;
	},

	get size(): number {
		return entries.length + schemaAdds.length;
	},

	get schemaAdds(): SchemaAddColumn[] {
		return schemaAdds;
	},

	addedColumnsFor(table: string): string[] {
		return schemaAdds.filter((c) => c.table === table).map((c) => c.name);
	},

	addColumn(table: string, name: string): string | null {
		const tbl = table.trim();
		const col = name.trim();
		if (!tbl || !isIdent(col)) return "Use a letter-or-underscore name (A–Z, 0–9, _).";
		const lower = col.toLowerCase();
		if (
			lower === "source_id" ||
			lower === "entity_type" ||
			lower === "geom" ||
			lower === "geometry" ||
			col.startsWith("_")
		) {
			return "That name is reserved.";
		}
		if (schemaAdds.some((c) => c.table === tbl && c.name.toLowerCase() === lower)) {
			return "That column is already in this session.";
		}
		schemaAdds = [...schemaAdds, { table: tbl, name: col }];
		persist();
		return null;
	},

	get baseCommit(): string {
		return baseCommit;
	},

	setBaseCommit(id: string): void {
		if (baseCommit === id) return;
		baseCommit = id;
		persist();
	},

	/** Load (or switch) the persisted session for a project slug. */
	bindProject(slug: string): void {
		const next = slug.trim();
		if (next === boundSlug) return;
		if (boundSlug) persist();
		loadSlug(next);
	},

	/** Pending row counts per table (skips `_draw` placeholder). */
	get pendingByTable(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const e of entries) {
			if (!e.table || e.table === PLACEHOLDER_TABLE || e.table.startsWith("_")) continue;
			out[e.table] = (out[e.table] ?? 0) + 1;
		}
		return out;
	},

	get targetLayer(): string | null {
		return targetLayer;
	},

	setTargetLayer(name: string | null): void {
		if (targetLayer === name) return;
		targetLayer = name;
		persist();
	},

	entryFor(table: string, entityId: string): EditBufferEntry | undefined {
		return entries.find((e) => e.table === table && e.entityId === entityId);
	},

	nextEntityId(): string {
		seq += 1;
		persist();
		return `draft-${seq}`;
	},

	push(entry: EditBufferEntry): void {
		entries = [...entries, entry];
		persist();
	},

	pop(): EditBufferEntry | undefined {
		if (entries.length === 0) return undefined;
		const last = entries[entries.length - 1];
		entries = entries.slice(0, -1);
		persist();
		return last;
	},

	remove(table: string, entityId: string): void {
		entries = entries.filter(
			(e) => !(e.table === table && e.entityId === entityId),
		);
		persist();
	},

	clear(): void {
		entries = [];
		schemaAdds = [];
		baseCommit = "";
		persist();
	},

	upsert(entry: EditBufferEntry): void {
		const i = entries.findIndex(
			(e) => e.table === entry.table && e.entityId === entry.entityId,
		);
		if (i < 0) {
			entries = [...entries, entry];
			persist();
			return;
		}
		const prev = entries[i]!;
		const op = prev.op === "insert" ? "insert" : entry.op;
		const oldGeometry =
			prev.op === "insert"
				? prev.oldGeometry
				: (prev.oldGeometry ?? entry.oldGeometry);
		const next = [...entries];
		next[i] = {
			...prev,
			...entry,
			op,
			oldGeometry,
			geometry:
				entry.geometry !== undefined ? entry.geometry : prev.geometry,
			attributes: entry.attributes ?? prev.attributes,
		};
		entries = next;
		persist();
	},

	/** Attribute-only upsert (keeps existing geometry / insert vs update). */
	upsertAttributes(
		table: string,
		entityId: string,
		attributes: Record<string, unknown>,
	): void {
		const prev = entries.find(
			(e) => e.table === table && e.entityId === entityId,
		);
		if (prev?.op === "delete") return;
		editBuffer.upsert({
			op: prev?.op === "insert" ? "insert" : "update",
			table,
			entityId,
			attributes: { ...(prev?.attributes ?? {}), ...attributes },
		});
	},

	/**
	 * Mark a canonical row deleted. A session insert is dropped instead
	 * (it never existed on the server).
	 */
	markDelete(
		table: string,
		entityId: string,
		geometry?: unknown | null,
	): void {
		const prev = entries.find(
			(e) => e.table === table && e.entityId === entityId,
		);
		if (prev?.op === "insert") {
			entries = entries.filter(
				(e) => !(e.table === table && e.entityId === entityId),
			);
			persist();
			return;
		}
		const geom =
			geometry !== undefined && geometry !== null
				? geometry
				: (prev?.geometry ?? prev?.oldGeometry ?? null);
		editBuffer.upsert({
			op: "delete",
			table,
			entityId,
			geometry: geom,
			oldGeometry: prev?.oldGeometry ?? geom,
		});
	},
};

export type LonLatVertex = {
	lon: number;
	lat: number;
	height?: number;
};

export function minVerticesForMode(mode: DrawGeomMode): number {
	switch (mode) {
		case "Point":
		case "MultiPoint":
			return 1;
		case "LineString":
		case "MultiLineString":
			return 2;
		case "Polygon":
		case "MultiPolygon":
			return 3;
	}
}

export function isMultipartMode(mode: DrawGeomMode): boolean {
	return (
		mode === "MultiLineString" ||
		mode === "MultiPolygon"
	);
}

/** Non-geometry columns for a create/edit form. */
export function attrFieldsForTable(columns: string[]): string[] {
	return columns.filter(
		(c) => !/^_?geom/i.test(c) && !c.startsWith("_"),
	);
}

export type SnapMode = "mesh" | "terrain" | "ellipsoid";

export const SNAP_MODES: { id: SnapMode; label: string }[] = [
	{ id: "mesh", label: "Mesh" },
	{ id: "terrain", label: "Terrain" },
	{ id: "ellipsoid", label: "Ellipsoid" },
];

function coordToVertex(c: unknown): LonLatVertex | null {
	if (!Array.isArray(c) || c.length < 2) return null;
	const lon = Number(c[0]);
	const lat = Number(c[1]);
	if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
	const height =
		c.length > 2 && Number.isFinite(Number(c[2])) ? Number(c[2]) : 0;
	return { lon, lat, height };
}

function ringToVertices(ring: unknown): LonLatVertex[] {
	const coords = Array.isArray(ring) ? ring : [];
	const verts: LonLatVertex[] = [];
	for (const c of coords) {
		const v = coordToVertex(c);
		if (v) verts.push(v);
	}
	if (verts.length >= 2) {
		const a = verts[0]!;
		const b = verts[verts.length - 1]!;
		if (
			a.lon === b.lon &&
			a.lat === b.lat &&
			(a.height ?? 0) === (b.height ?? 0)
		) {
			verts.pop();
		}
	}
	return verts;
}

/** Inverse of `geometryFromDraft` — load a GeoJSON geom into the draw session. */
export function draftFromGeometry(
	geom: GeoJsonGeometry | null | undefined,
): {
	mode: DrawGeomMode;
	vertices: LonLatVertex[];
	parts: LonLatVertex[][];
} | null {
	if (!geom) return null;
	switch (geom.type) {
		case "Point": {
			const v = coordToVertex(geom.coordinates);
			if (!v) return null;
			return { mode: "Point", vertices: [v], parts: [] };
		}
		case "LineString": {
			const vertices = ringToVertices(geom.coordinates);
			if (vertices.length < 2) return null;
			return { mode: "LineString", vertices, parts: [] };
		}
		case "Polygon": {
			const rings = Array.isArray(geom.coordinates)
				? geom.coordinates
				: [];
			const vertices = ringToVertices(rings[0]);
			if (vertices.length < 3) return null;
			return { mode: "Polygon", vertices, parts: [] };
		}
		case "MultiPoint": {
			const vertices = ringToVertices(geom.coordinates);
			if (vertices.length < 1) return null;
			return { mode: "MultiPoint", vertices, parts: [] };
		}
		case "MultiLineString": {
			const raw = Array.isArray(geom.coordinates) ? geom.coordinates : [];
			const lines = raw
				.map((r) => ringToVertices(r))
				.filter((p) => p.length >= 2);
			if (lines.length === 0) return null;
			return {
				mode: "MultiLineString",
				vertices: lines[lines.length - 1]!,
				parts: lines.slice(0, -1),
			};
		}
		case "MultiPolygon": {
			const raw = Array.isArray(geom.coordinates) ? geom.coordinates : [];
			const polys: LonLatVertex[][] = [];
			for (const poly of raw) {
				const verts = ringToVertices(
					Array.isArray(poly) ? poly[0] : null,
				);
				if (verts.length >= 3) polys.push(verts);
			}
			if (polys.length === 0) return null;
			return {
				mode: "MultiPolygon",
				vertices: polys[polys.length - 1]!,
				parts: polys.slice(0, -1),
			};
		}
		default:
			return null;
	}
}

function coord(v: LonLatVertex, withHeight: boolean): number[] {
	if (withHeight) return [v.lon, v.lat, v.height ?? 0];
	return [v.lon, v.lat];
}

function closedRing(verts: LonLatVertex[], withHeight: boolean): number[][] {
	const ring = verts.map((v) => coord(v, withHeight));
	if (ring.length === 0) return ring;
	const a = ring[0]!;
	const b = ring[ring.length - 1]!;
	if (a[0] !== b[0] || a[1] !== b[1] || (a[2] ?? 0) !== (b[2] ?? 0)) {
		ring.push([...a]);
	}
	return ring;
}

/** Closed GeoJSON Polygon from click vertices (first point repeated). */
function polygonFromVertices(
	verts: LonLatVertex[],
	withHeight = true,
): {
	type: "Polygon";
	coordinates: number[][][];
} {
	return { type: "Polygon", coordinates: [closedRing(verts, withHeight)] };
}

export function geometryFromDraft(
	mode: DrawGeomMode,
	current: LonLatVertex[],
	parts: LonLatVertex[][],
	withHeight = true,
): GeoJsonGeometry | null {
	switch (mode) {
		case "Point": {
			const v = current[0];
			if (!v) return null;
			return { type: "Point", coordinates: coord(v, withHeight) };
		}
		case "LineString": {
			if (current.length < 2) return null;
			return {
				type: "LineString",
				coordinates: current.map((v) => coord(v, withHeight)),
			};
		}
		case "Polygon": {
			if (current.length < 3) return null;
			return polygonFromVertices(current, withHeight);
		}
		case "MultiPoint": {
			if (current.length < 1) return null;
			return {
				type: "MultiPoint",
				coordinates: current.map((v) => coord(v, withHeight)),
			};
		}
		case "MultiLineString": {
			const lines = [
				...parts.filter((p) => p.length >= 2),
				...(current.length >= 2 ? [current] : []),
			];
			if (lines.length === 0) return null;
			return {
				type: "MultiLineString",
				coordinates: lines.map((p) => p.map((v) => coord(v, withHeight))),
			};
		}
		case "MultiPolygon": {
			const polys = [
				...parts.filter((p) => p.length >= 3),
				...(current.length >= 3 ? [current] : []),
			];
			if (polys.length === 0) return null;
			return {
				type: "MultiPolygon",
				coordinates: polys.map((p) => [closedRing(p, withHeight)]),
			};
		}
	}
	return null;
}
