import type { MeasureMode, MeasureVertex } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lon/lat points (metres). */
export function distanceMeters(a: MeasureVertex, b: MeasureVertex): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lon - a.lon);
  const s =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Sum of great-circle segments. */
export function pathLengthMeters(vertices: MeasureVertex[]): number {
  let sum = 0;
  for (let i = 1; i < vertices.length; i++) {
    sum += distanceMeters(vertices[i - 1]!, vertices[i]!);
  }
  return sum;
}

/**
 * Spherical polygon area (m²) via spherical excess.
 * Ring need not be closed; first/last may match.
 */
export function ringAreaSqMeters(vertices: MeasureVertex[]): number {
  if (vertices.length < 3) return 0;
  const ring = [...vertices];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first.lon !== last.lon || first.lat !== last.lat) {
    ring.push({ lon: first.lon, lat: first.lat });
  }
  if (ring.length < 4) return 0;

  // Longitude wrap-aware ring area on unit sphere (Karney / spherical excess).
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i]!;
    const p2 = ring[i + 1]!;
    total +=
      toRad(p2.lon - p1.lon) *
      (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  const area = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return area;
}

export function computeMeasureValue(
  mode: MeasureMode,
  vertices: MeasureVertex[],
): number {
  if (mode === "point") return 0;
  if (mode === "area") return ringAreaSqMeters(vertices);
  return pathLengthMeters(vertices);
}

export function minVertices(mode: MeasureMode): number {
  if (mode === "point") return 1;
  if (mode === "area") return 3;
  return 2; // length (2-point segment or longer polyline)
}
