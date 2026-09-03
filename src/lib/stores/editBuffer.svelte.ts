/** Session CRUD edit buffer. Commit goes pending+message — no canonical write. */

import type { EditBufferEntry, GeoJsonGeometry } from "$lib/geoDiff";

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
let targetLayer = $state<string | null>(null);

/** Fallback layer name while drawing with no table selected. */
export const PLACEHOLDER_TABLE = "_draw";

export const editBuffer = {
	get entries(): EditBufferEntry[] {
		return entries;
	},

	get size(): number {
		return entries.length;
	},

	get targetLayer(): string | null {
		return targetLayer;
	},

	setTargetLayer(name: string | null): void {
		targetLayer = name;
	},

	nextEntityId(): string {
		seq += 1;
		return `draft-${seq}`;
	},

	push(entry: EditBufferEntry): void {
		entries = [...entries, entry];
	},

	pop(): EditBufferEntry | undefined {
		if (entries.length === 0) return undefined;
		const last = entries[entries.length - 1];
		entries = entries.slice(0, -1);
		return last;
	},

	remove(entityId: string): void {
		entries = entries.filter((e) => e.entityId !== entityId);
	},

	clear(): void {
		entries = [];
	},

	upsert(entry: EditBufferEntry): void {
		const i = entries.findIndex(
			(e) => e.table === entry.table && e.entityId === entry.entityId,
		);
		if (i < 0) {
			entries = [...entries, entry];
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
			attributes: entry.attributes ?? prev.attributes,
		};
		entries = next;
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
export function polygonFromVertices(
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
