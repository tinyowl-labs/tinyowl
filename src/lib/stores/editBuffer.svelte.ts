/** Session CRUD edit buffer — local only; no pending/canonical write. */

import type { EditBufferEntry } from "$lib/geoDiff";

export const PLACEHOLDER_TABLE = "drawn";

let seq = 0;
let entries = $state<EditBufferEntry[]>([]);

export const editBuffer = {
	get entries(): EditBufferEntry[] {
		return entries;
	},

	get size(): number {
		return entries.length;
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

/** Closed GeoJSON Polygon from click vertices (first point repeated). */
export function polygonFromVertices(verts: LonLatVertex[]): {
	type: "Polygon";
	coordinates: number[][][];
} {
	const ring: number[][] = verts.map((v) => [
		v.lon,
		v.lat,
		v.height ?? 0,
	]);
	if (ring.length > 0) {
		const a = ring[0]!;
		const b = ring[ring.length - 1]!;
		if (a[0] !== b[0] || a[1] !== b[1] || (a[2] ?? 0) !== (b[2] ?? 0)) {
			ring.push([...a]);
		}
	}
	return { type: "Polygon", coordinates: [ring] };
}
