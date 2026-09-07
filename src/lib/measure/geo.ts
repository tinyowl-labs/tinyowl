import type { MeasureMode, MeasureVertex } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lon/lat points (metres). */
function distanceMeters(a: MeasureVertex, b: MeasureVertex): number {
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
function pathLengthMeters(vertices: MeasureVertex[]): number {
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
function ringAreaSqMeters(vertices: MeasureVertex[]): number {
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

/** True when a length can use 3D / H/V / profile (every vertex has height). */
export function verticesHaveHeight(vertices: MeasureVertex[]): boolean {
  return (
    vertices.length >= 2 &&
    vertices.every(
      (v) => v.height != null && Number.isFinite(v.height),
    )
  );
}

export type LengthBreakdown = {
  /** Great-circle path (m). */
  horizontal: number;
  /** Signed net height last − first (m). */
  vertical: number;
  /** Σ hypot(horiz, Δh) per segment; equals horizontal when no heights. */
  length3d: number;
  hasHeight: boolean;
};

export function lengthBreakdown(vertices: MeasureVertex[]): LengthBreakdown {
  const horizontal = pathLengthMeters(vertices);
  if (!verticesHaveHeight(vertices)) {
    return {
      horizontal,
      vertical: 0,
      length3d: horizontal,
      hasHeight: false,
    };
  }
  let length3d = 0;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!;
    const b = vertices[i]!;
    length3d += Math.hypot(distanceMeters(a, b), b.height! - a.height!);
  }
  return {
    horizontal,
    vertical: vertices[vertices.length - 1]!.height! - vertices[0]!.height!,
    length3d,
    hasHeight: true,
  };
}

/** Chord-station profile: X = cumulative great-circle, Y = height − start. */
export type ProfilePoint = { x: number; y: number };

const PROFILE_MIN_RANGE_M = 0.01;

export function elevationProfile(
  vertices: MeasureVertex[],
): ProfilePoint[] | null {
  if (!verticesHaveHeight(vertices)) return null;
  const start = vertices[0]!.height!;
  const ys = vertices.map((v) => v.height! - start);
  let minY = ys[0]!;
  let maxY = ys[0]!;
  for (const y of ys) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxY - minY < PROFILE_MIN_RANGE_M) return null;
  const pts: ProfilePoint[] = [{ x: 0, y: ys[0]! }];
  let x = 0;
  for (let i = 1; i < vertices.length; i++) {
    x += distanceMeters(vertices[i - 1]!, vertices[i]!);
    pts.push({ x, y: ys[i]! });
  }
  return pts;
}

export function computeMeasureValue(
  mode: MeasureMode,
  vertices: MeasureVertex[],
): number {
  if (mode === "point") return 0;
  if (mode === "area") return ringAreaSqMeters(vertices);
  return lengthBreakdown(vertices).length3d;
}

export function minVertices(mode: MeasureMode): number {
  if (mode === "point") return 1;
  if (mode === "area") return 3;
  return 2; // length (2-point segment or longer polyline)
}
