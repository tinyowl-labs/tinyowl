import type {
  MeasureMode,
  MeasureVertex,
  ProfilePoint,
  VolumeBreakdown,
} from "./types";

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

const PROFILE_MIN_RANGE_M = 0.01;
const PROFILE_MIN_SPACING_M = 0.05;
const PROFILE_MAX_POINTS = 64;

export type LengthStation = {
  lon: number;
  lat: number;
  /** Cumulative great-circle from start (m). */
  x: number;
  /** Index into `vertices` when this station is a click. */
  vertex?: number;
};

/** Densify a length polyline for surface sampling (endpoints are clicks). */
export function lengthStations(
  vertices: MeasureVertex[],
  opts?: { spacingM?: number; maxPoints?: number },
): LengthStation[] {
  if (vertices.length < 2) return [];
  const horiz = pathLengthMeters(vertices);
  if (!(horiz > 0)) {
    return [
      { lon: vertices[0]!.lon, lat: vertices[0]!.lat, x: 0, vertex: 0 },
      {
        lon: vertices[vertices.length - 1]!.lon,
        lat: vertices[vertices.length - 1]!.lat,
        x: 0,
        vertex: vertices.length - 1,
      },
    ];
  }
  const maxPoints = opts?.maxPoints ?? PROFILE_MAX_POINTS;
  const spacing = Math.max(
    opts?.spacingM ?? PROFILE_MIN_SPACING_M,
    horiz / Math.max(1, maxPoints),
  );
  const out: LengthStation[] = [
    { lon: vertices[0]!.lon, lat: vertices[0]!.lat, x: 0, vertex: 0 },
  ];
  let x0 = 0;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1]!;
    const b = vertices[i]!;
    const seg = distanceMeters(a, b);
    const steps = Math.max(1, Math.round(seg / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lon: a.lon + (b.lon - a.lon) * t,
        lat: a.lat + (b.lat - a.lat) * t,
        x: x0 + seg * t,
        vertex: s === steps ? i : undefined,
      });
    }
    x0 += seg;
  }
  return out;
}

export function elevationProfile(
  vertices: MeasureVertex[],
): ProfilePoint[] | null {
  return finishProfile(elevationProfileRaw(vertices));
}

/**
 * Sample surface height between clicks. `sampleHeight` is lon/lat → ellipsoidal m.
 * Click vertices keep their picked height; intermediates use the sampler.
 */
export function sampledElevationProfile(
  vertices: MeasureVertex[],
  sampleHeight: (lon: number, lat: number) => number | undefined,
): ProfilePoint[] | null {
  if (!verticesHaveHeight(vertices)) return null;
  const start = vertices[0]!.height!;
  const stations = lengthStations(vertices);
  const raw: ProfilePoint[] = [];
  for (const st of stations) {
    let h: number | undefined;
    if (st.vertex != null) {
      h = vertices[st.vertex]!.height;
    } else {
      h = sampleHeight(st.lon, st.lat);
    }
    if (h == null || !Number.isFinite(h)) continue;
    raw.push({ x: st.x, y: h - start });
  }
  return finishProfile(raw);
}

function elevationProfileRaw(vertices: MeasureVertex[]): ProfilePoint[] | null {
  if (!verticesHaveHeight(vertices)) return null;
  const start = vertices[0]!.height!;
  const pts: ProfilePoint[] = [{ x: 0, y: 0 }];
  let x = 0;
  for (let i = 1; i < vertices.length; i++) {
    x += distanceMeters(vertices[i - 1]!, vertices[i]!);
    pts.push({ x, y: vertices[i]!.height! - start });
  }
  return pts;
}

function finishProfile(pts: ProfilePoint[] | null): ProfilePoint[] | null {
  if (!pts || pts.length < 2) return null;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxY - minY < PROFILE_MIN_RANGE_M) return null;
  return pts;
}

const AREA_MAX_GRID = 8;

type Enu = { e: number; n: number; u: number };

function openRing(vertices: MeasureVertex[]): MeasureVertex[] {
  if (vertices.length < 3) return [];
  const ring = [...vertices];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first.lon === last.lon && first.lat === last.lat) ring.pop();
  return ring.length >= 3 ? ring : [];
}

function toEnu(origin: MeasureVertex, p: MeasureVertex): Enu {
  const lat0 = toRad(origin.lat);
  return {
    e: toRad(p.lon - origin.lon) * Math.cos(lat0) * EARTH_RADIUS_M,
    n: toRad(p.lat - origin.lat) * EARTH_RADIUS_M,
    u: (p.height ?? 0) - (origin.height ?? 0),
  };
}

function triangleArea3d(a: Enu, b: Enu, c: Enu): number {
  const ab = { e: b.e - a.e, n: b.n - a.n, u: b.u - a.u };
  const ac = { e: c.e - a.e, n: c.n - a.n, u: c.u - a.u };
  const cx = ab.n * ac.u - ab.u * ac.n;
  const cy = ab.u * ac.e - ab.e * ac.u;
  const cz = ab.e * ac.n - ab.n * ac.e;
  return 0.5 * Math.hypot(cx, cy, cz);
}

function pointInRing(lon: number, lat: number, ring: MeasureVertex[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i]!.lat;
    const yj = ring[j]!.lat;
    const xi = ring[i]!.lon;
    const xj = ring[j]!.lon;
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function onRing(lon: number, lat: number, ring: MeasureVertex[]): boolean {
  const eps = 1e-18;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ab = dist2(a.lon, a.lat, b.lon, b.lat);
    if (ab < eps) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((lon - a.lon) * (b.lon - a.lon) + (lat - a.lat) * (b.lat - a.lat)) / ab,
      ),
    );
    const px = a.lon + t * (b.lon - a.lon);
    const py = a.lat + t * (b.lat - a.lat);
    if (dist2(lon, lat, px, py) <= eps * Math.max(1, ab)) return true;
  }
  return false;
}

function sampleable(lon: number, lat: number, ring: MeasureVertex[]): boolean {
  return pointInRing(lon, lat, ring) || onRing(lon, lat, ring);
}

/** 3D surface of the click ring (centroid fan in local ENU). */
export function vertexSurfaceArea(vertices: MeasureVertex[]): number {
  const ring = openRing(vertices);
  if (ring.length < 3) return 0;
  if (!ring.every((v) => v.height != null && Number.isFinite(v.height))) return 0;
  const origin = ring[0]!;
  const pts = ring.map((v) => toEnu(origin, v));
  let ce = 0;
  let cn = 0;
  let cu = 0;
  for (const p of pts) {
    ce += p.e;
    cn += p.n;
    cu += p.u;
  }
  const c: Enu = { e: ce / pts.length, n: cn / pts.length, u: cu / pts.length };
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    area += triangleArea3d(c, pts[i]!, pts[(i + 1) % pts.length]!);
  }
  return area;
}

export type AreaBreakdown = {
  /** Spherical-excess footprint (m²). */
  planimetric: number;
  /** 3D TIN surface (sampled or vertex fan). */
  surface3d: number;
  /** Hero: 3D when heights exist, else planimetric. */
  hero: number;
  hasHeight: boolean;
};

export function areaBreakdown(
  vertices: MeasureVertex[],
  sampledSurface?: number | null,
): AreaBreakdown {
  const planimetric = ringAreaSqMeters(vertices);
  const hasHeight =
    vertices.length >= 3 &&
    vertices.every((v) => v.height != null && Number.isFinite(v.height));
  if (!hasHeight) {
    return {
      planimetric,
      surface3d: planimetric,
      hero: planimetric,
      hasHeight: false,
    };
  }
  const vertexSurf = vertexSurfaceArea(vertices);
  const surface3d =
    sampledSurface != null && sampledSurface > 0 ? sampledSurface : vertexSurf;
  return {
    planimetric,
    surface3d,
    hero: surface3d,
    hasHeight: true,
  };
}

/**
 * Coarse interior grid (≤8×8) → 3D TIN. Same pick budget as the length profile.
 * Not injalak 6×6→16×16 / MostDetailed.
 */
export function sampledSurfaceArea(
  vertices: MeasureVertex[],
  sampleHeight: (lon: number, lat: number) => number | undefined,
  opts?: { maxGrid?: number },
): number | null {
  const ring = openRing(vertices);
  if (ring.length < 3) return null;
  const origin = ring[0]!;
  let minLon = ring[0]!.lon;
  let maxLon = ring[0]!.lon;
  let minLat = ring[0]!.lat;
  let maxLat = ring[0]!.lat;
  for (const v of ring) {
    if (v.lon < minLon) minLon = v.lon;
    if (v.lon > maxLon) maxLon = v.lon;
    if (v.lat < minLat) minLat = v.lat;
    if (v.lat > maxLat) maxLat = v.lat;
  }
  const n = Math.max(2, Math.min(opts?.maxGrid ?? AREA_MAX_GRID, AREA_MAX_GRID));
  if (!(maxLon > minLon) || !(maxLat > minLat)) return null;

  const node: (Enu | null)[][] = [];
  for (let j = 0; j <= n; j++) {
    const row: (Enu | null)[] = [];
    const lat = minLat + ((maxLat - minLat) * j) / n;
    for (let i = 0; i <= n; i++) {
      const lon = minLon + ((maxLon - minLon) * i) / n;
      if (!sampleable(lon, lat, ring)) {
        row.push(null);
        continue;
      }
      const h = sampleHeight(lon, lat);
      if (h == null || !Number.isFinite(h)) {
        row.push(null);
        continue;
      }
      row.push(toEnu(origin, { lon, lat, height: h }));
    }
    node.push(row);
  }

  let area = 0;
  let tris = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = node[j]![i]!;
      const b = node[j]![i + 1]!;
      const c = node[j + 1]![i]!;
      const d = node[j + 1]![i + 1]!;
      if (a && b && c) {
        area += triangleArea3d(a, b, c);
        tris++;
      }
      if (b && d && c) {
        area += triangleArea3d(b, d, c);
        tris++;
      }
    }
  }
  return tris > 0 ? area : null;
}

function rimHeight(vertices: MeasureVertex[]): number | null {
  const ring = openRing(vertices);
  if (ring.length < 3) return null;
  if (!ring.every((v) => v.height != null && Number.isFinite(v.height))) {
    return null;
  }
  let sum = 0;
  for (const v of ring) sum += v.height!;
  return sum / ring.length;
}

/**
 * Prism cut/fill vs mean edge Z. Interior samples only (rim clicks set the plane).
 * Same ≤8×8 budget as area — not injalak 6×6→16×16 / MostDetailed.
 */
export function sampledVolume(
  vertices: MeasureVertex[],
  sampleHeight: (lon: number, lat: number) => number | undefined,
  opts?: { maxGrid?: number },
): VolumeBreakdown | null {
  const ring = openRing(vertices);
  const rim = rimHeight(vertices);
  const planimetric = ringAreaSqMeters(vertices);
  if (rim == null || !(planimetric > 0) || ring.length < 3) return null;

  let minLon = ring[0]!.lon;
  let maxLon = ring[0]!.lon;
  let minLat = ring[0]!.lat;
  let maxLat = ring[0]!.lat;
  for (const v of ring) {
    if (v.lon < minLon) minLon = v.lon;
    if (v.lon > maxLon) maxLon = v.lon;
    if (v.lat < minLat) minLat = v.lat;
    if (v.lat > maxLat) maxLat = v.lat;
  }
  const n = Math.max(2, Math.min(opts?.maxGrid ?? AREA_MAX_GRID, AREA_MAX_GRID));
  if (!(maxLon > minLon) || !(maxLat > minLat)) return null;

  const heights: { lon: number; lat: number; h: number }[] = [];
  for (let j = 0; j <= n; j++) {
    const lat = minLat + ((maxLat - minLat) * j) / n;
    for (let i = 0; i <= n; i++) {
      const lon = minLon + ((maxLon - minLon) * i) / n;
      if (!pointInRing(lon, lat, ring)) continue;
      const h = sampleHeight(lon, lat);
      if (h == null || !Number.isFinite(h)) continue;
      heights.push({ lon, lat, h });
    }
  }
  if (heights.length < 3) return null;

  const cell = planimetric / heights.length;
  let cut = 0;
  let fill = 0;
  let cutDh = 0;
  let fillDh = 0;
  let cutN = 0;
  let fillN = 0;
  const samples: VolumeBreakdown["samples"] = [];
  for (const s of heights) {
    const d = s.h - rim;
    samples.push({ lon: s.lon, lat: s.lat, height: s.h });
    if (d < 0) {
      cut += -d * cell;
      cutDh += -d;
      cutN++;
    } else {
      fill += d * cell;
      fillDh += d;
      fillN++;
    }
  }
  const kind: "cut" | "fill" = cut >= fill ? "cut" : "fill";
  return {
    cut,
    fill,
    rim,
    hero: kind === "cut" ? cut : fill,
    kind,
    avgCut: cutN > 0 ? cutDh / cutN : 0,
    avgFill: fillN > 0 ? fillDh / fillN : 0,
    samples,
  };
}

export function applyVolumeKind(
  vol: VolumeBreakdown,
  kind: "cut" | "fill",
): VolumeBreakdown {
  return {
    ...vol,
    kind,
    hero: kind === "cut" ? vol.cut : vol.fill,
  };
}

export function computeMeasureValue(
  mode: MeasureMode,
  vertices: MeasureVertex[],
  extra?: { surface3d?: number | null; volume?: VolumeBreakdown | null },
): number {
  if (mode === "point") return 0;
  if (mode === "area") return areaBreakdown(vertices, extra?.surface3d).hero;
  if (mode === "volume") return extra?.volume?.hero ?? 0;
  return lengthBreakdown(vertices).length3d;
}

export function minVertices(mode: MeasureMode): number {
  if (mode === "point") return 1;
  if (mode === "area" || mode === "volume") return 3;
  return 2; // length (2-point segment or longer polyline)
}
