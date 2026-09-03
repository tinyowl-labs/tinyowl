/** Session CRUD edit buffer — local only; no pending/canonical write. */

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

	remove(entityId: string): void {
		entries = entries.filter((e) => e.entityId !== entityId);
	},

	clear(): void {
		entries = [];
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
