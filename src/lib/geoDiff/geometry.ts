import type { GeoJsonGeometry } from "./types";

/** Heights at or below this (metres) are treated as ground-clamped, not 3D. */
const FLAT_Z_M = 0.5;

/** Cap vertices on awareness / broadcast payloads. */
const MAX_OVERLAY_VERTS = 32;

function positionHasMeaningfulZ(pos: unknown): boolean {
    if (!Array.isArray(pos) || pos.length < 3) return false;
    const z = Number(pos[2]);
    return Number.isFinite(z) && Math.abs(z) > FLAT_Z_M;
}

/** True when any coordinate carries a real height (not 0 / missing). */
export function coordsHaveMeaningfulZ(coords: unknown): boolean {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    if (typeof coords[0] === "number") return positionHasMeaningfulZ(coords);
    return coords.some((c) => coordsHaveMeaningfulZ(c));
}

function compactPosition(pos: unknown, keepZ: boolean): number[] | null {
    if (!Array.isArray(pos) || pos.length < 2) return null;
    const lon = Number(pos[0]);
    const lat = Number(pos[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (keepZ && pos.length > 2 && Number.isFinite(Number(pos[2]))) {
        return [lon, lat, Number(pos[2])];
    }
    return [lon, lat];
}

function downsampleRing(
    ring: unknown[],
    maxVerts: number,
    keepZ: boolean,
): number[][] {
    const mapped: number[][] = [];
    for (const p of ring) {
        const c = compactPosition(p, keepZ);
        if (c) mapped.push(c);
    }
    if (mapped.length <= maxVerts) return mapped;
    const last = mapped.length - 1;
    const step = last / (maxVerts - 1);
    const out: number[][] = [];
    for (let i = 0; i < maxVerts - 1; i++) {
        out.push(mapped[Math.round(i * step)]!);
    }
    out.push(mapped[last]!);
    return out;
}

function compactCoords(
    coords: unknown,
    maxVerts: number,
    keepZ: boolean,
): unknown {
    if (!Array.isArray(coords) || coords.length === 0) return coords;
    if (typeof coords[0] === "number") {
        return compactPosition(coords, keepZ) ?? coords;
    }
    const first = coords[0];
    if (Array.isArray(first) && typeof first[0] === "number") {
        return downsampleRing(coords, maxVerts, keepZ);
    }
    return coords.map((c) => compactCoords(c, maxVerts, keepZ));
}

/**
 * Drop flat Z and downsample rings so Broadcast payloads stay tiny.
 * Selection overlays look up local CZML; this is for buffer geometry on the wire.
 */
export function compactGeometry(
    raw: unknown,
    maxVerts = MAX_OVERLAY_VERTS,
): GeoJsonGeometry | null {
    const g = asGeometry(raw);
    if (!g) return null;
    if (g.type === "GeometryCollection") {
        const geometries = Array.isArray(g.geometries)
            ? g.geometries
                  .map((child) => compactGeometry(child, maxVerts))
                  .filter((c): c is GeoJsonGeometry => c != null)
            : [];
        return { type: "GeometryCollection", geometries };
    }
    if (!Array.isArray(g.coordinates)) return g;
    const keepZ = coordsHaveMeaningfulZ(g.coordinates);
    return {
        type: g.type,
        coordinates: compactCoords(g.coordinates, maxVerts, keepZ),
    };
}

/** Coerce GeoJSON geometry, a Feature, or a JSON string. */
export function asGeometry(raw: unknown): GeoJsonGeometry | null {
    if (raw == null || raw === "") return null;
    let g: unknown = raw;
    if (typeof g === "string") {
        try {
            g = JSON.parse(g);
        } catch {
            return null;
        }
    }
    if (!g || typeof g !== "object") return null;
    const obj = g as Record<string, unknown>;
    if (typeof obj.type === "string") {
        if (obj.type === "Feature") return asGeometry(obj.geometry);
        if (obj.type === "GeometryCollection") {
            return {
                type: "GeometryCollection",
                geometries: obj.geometries,
            };
        }
        if (obj.type === "Point" || Array.isArray(obj.coordinates)) {
            return {
                type: obj.type,
                coordinates: obj.coordinates,
            };
        }
    }
    return null;
}

export function geometriesEqual(
    a: GeoJsonGeometry | null | undefined,
    b: GeoJsonGeometry | null | undefined,
): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

export type LonLatBbox = {
    west: number;
    south: number;
    east: number;
    north: number;
};

function walkLonLat(c: unknown, acc: number[][]) {
    if (!Array.isArray(c) || c.length === 0) return;
    if (typeof c[0] === "number") {
        acc.push(c as number[]);
        return;
    }
    for (const x of c) walkLonLat(x, acc);
}

function bboxFromGeometry(raw: unknown): LonLatBbox | null {
    const g = asGeometry(raw);
    if (!g) return null;
    const coords: number[][] = [];
    if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) {
        for (const part of g.geometries) {
            const child = asGeometry(part);
            if (child) walkLonLat(child.coordinates, coords);
        }
    } else {
        walkLonLat(g.coordinates, coords);
    }
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [x, y] of coords) {
        const lon = Number(x);
        const lat = Number(y);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
    }
    if (!Number.isFinite(west)) return null;
    return { west, south, east, north };
}

function unionBbox(
    a: LonLatBbox | null,
    b: LonLatBbox | null,
): LonLatBbox | null {
    if (!a) return b;
    if (!b) return a;
    return {
        west: Math.min(a.west, b.west),
        south: Math.min(a.south, b.south),
        east: Math.max(a.east, b.east),
        north: Math.max(a.north, b.north),
    };
}

/** Envelope of after + before geometries (updates include both). */
export function bboxFromDiffGeoms(
    features: { geometry?: unknown; oldGeometry?: unknown }[],
): LonLatBbox | null {
    let box: LonLatBbox | null = null;
    for (const f of features) {
        box = unionBbox(box, bboxFromGeometry(f.geometry));
        box = unionBbox(box, bboxFromGeometry(f.oldGeometry));
    }
    return box;
}
