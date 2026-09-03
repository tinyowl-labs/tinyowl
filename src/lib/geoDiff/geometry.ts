import type { GeoJsonGeometry } from "./types";

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
