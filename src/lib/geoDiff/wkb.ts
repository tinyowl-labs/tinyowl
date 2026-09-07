import type { GeoJsonGeometry } from "./types";
import { asGeometry } from "./geometry";

const GEOM_NAMES = new Set([
    "geom",
    "geometry",
    "shape",
    "the_geom",
    "wkb_geometry",
]);

export function isGeomColumnName(name: string): boolean {
    return GEOM_NAMES.has(name.trim().toLowerCase());
}

/** GeoJSON, WKB hex, or GPKG/WKB base64 from ListChanges blob columns. */
export function geometryFromChangeValue(raw: unknown): GeoJsonGeometry | null {
    const direct = asGeometry(raw);
    if (direct) return direct;
    const bytes = bytesFromChangeValue(raw);
    if (!bytes) return null;
    return wkbBytesToGeoJSON(bytes);
}

function bytesFromChangeValue(raw: unknown): Uint8Array | null {
    if (raw instanceof Uint8Array) return raw;
    if (typeof raw !== "string" || raw.length < 8) return null;
    const s = raw.trim();
    if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
        return hexToBytes(s);
    }
    try {
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

function hexToBytes(hex: string): Uint8Array {
    const n = hex.length / 2;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function stripGpkgHeader(data: Uint8Array): Uint8Array {
    if (data.length < 8 || data[0] !== 0x47 || data[1] !== 0x50) return data;
    const flags = data[3] ?? 0;
    const env = (flags >> 1) & 0x07;
    const headerSize =
        env === 0 ? 8 : env === 1 ? 40 : env === 2 || env === 4 ? 56 : env === 3 ? 72 : -1;
    if (headerSize < 0 || data.length < headerSize) return data;
    return data.subarray(headerSize);
}

function decodeWkbType(t: number): { base: number; hasZ: boolean; hasM: boolean } {
    const ewkbZ = 0x80000000;
    const ewkbM = 0x40000000;
    if (t & ewkbZ || t & ewkbM) {
        return {
            base: t & 0xff,
            hasZ: (t & ewkbZ) !== 0,
            hasM: (t & ewkbM) !== 0,
        };
    }
    if (t >= 3000 && t < 4000) return { base: t - 3000, hasZ: true, hasM: true };
    if (t >= 2000 && t < 3000) return { base: t - 2000, hasZ: false, hasM: true };
    if (t >= 1000 && t < 2000) return { base: t - 1000, hasZ: true, hasM: false };
    return { base: t, hasZ: false, hasM: false };
}

type Cursor = { view: DataView; off: number; le: boolean };

function u32(c: Cursor): number {
    const v = c.view.getUint32(c.off, c.le);
    c.off += 4;
    return v;
}

function f64(c: Cursor): number {
    const v = c.view.getFloat64(c.off, c.le);
    c.off += 8;
    return v;
}

function readPoint(c: Cursor, hasZ: boolean, hasM: boolean): number[] {
    const pt = [f64(c), f64(c)];
    if (hasZ) pt.push(f64(c));
    if (hasM) f64(c);
    return pt;
}

function readPolygon(c: Cursor, hasZ: boolean, hasM: boolean): number[][][] {
    const nrings = u32(c);
    const rings: number[][][] = [];
    for (let r = 0; r < nrings; r++) {
        const npts = u32(c);
        const ring: number[][] = [];
        for (let i = 0; i < npts; i++) ring.push(readPoint(c, hasZ, hasM));
        rings.push(ring);
    }
    return rings;
}

function readWkb(c: Cursor): GeoJsonGeometry | null {
    if (c.off + 5 > c.view.byteLength) return null;
    c.le = c.view.getUint8(c.off) === 1;
    c.off += 1;
    const { base, hasZ, hasM } = decodeWkbType(u32(c));
    switch (base) {
        case 1:
            return { type: "Point", coordinates: readPoint(c, hasZ, hasM) };
        case 2: {
            const n = u32(c);
            const coords: number[][] = [];
            for (let i = 0; i < n; i++) coords.push(readPoint(c, hasZ, hasM));
            return { type: "LineString", coordinates: coords };
        }
        case 3:
            return { type: "Polygon", coordinates: readPolygon(c, hasZ, hasM) };
        case 4: {
            const n = u32(c);
            const coords: number[][] = [];
            for (let i = 0; i < n; i++) {
                const g = readWkb(c);
                if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) {
                    return null;
                }
                coords.push(g.coordinates as number[]);
            }
            return { type: "MultiPoint", coordinates: coords };
        }
        case 5: {
            const n = u32(c);
            const coords: unknown[] = [];
            for (let i = 0; i < n; i++) {
                const g = readWkb(c);
                if (!g || g.type !== "LineString") return null;
                coords.push(g.coordinates);
            }
            return { type: "MultiLineString", coordinates: coords };
        }
        case 6: {
            const n = u32(c);
            const coords: unknown[] = [];
            for (let i = 0; i < n; i++) {
                const g = readWkb(c);
                if (!g || g.type !== "Polygon") return null;
                coords.push(g.coordinates);
            }
            return { type: "MultiPolygon", coordinates: coords };
        }
        default:
            return null;
    }
}

export function wkbBytesToGeoJSON(raw: Uint8Array): GeoJsonGeometry | null {
    const data = stripGpkgHeader(raw);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const c: Cursor = { view, off: 0, le: true };
    try {
        return readWkb(c);
    } catch {
        return null;
    }
}
