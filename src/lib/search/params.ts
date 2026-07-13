/** Shared URL vocabulary for `/search` discovery (QueryIR codec). */

export type SearchBBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type SearchParams = {
  q: string;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  bbox: SearchBBox | null;
  dateFrom: number | null;
  dateTo: number | null;
  /** AND facet filters (`?tag=` repeated) */
  tags: string[];
  /** Projects using these column_annotations.vocabulary values (`?vocab=`) */
  vocabularies: string[];
  /** Result kinds — scaffold; always project until mixed search ships */
  types: string[];
  /**
   * OpenCLIP text boost when q is set. Default on; opt out with `?semantic=0`.
   * Omitted from normal URLs — only `semantic=0` is written when disabled.
   */
  semantic: boolean;
};

export const DEFAULT_SEARCH_RADIUS = 5000;

export function formatBBox(b: SearchBBox): string {
  return `${b.west},${b.south},${b.east},${b.north}`;
}

export function parseBBox(raw: string | null | undefined): SearchBBox | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  let [west, south, east, north] = parts;
  if (west > east) [west, east] = [east, west];
  if (south > north) [south, north] = [north, south];
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  return { west, south, east, north };
}

function parseListParam(sp: URLSearchParams, key: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of sp.getAll(key)) {
    const v = raw.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function parseSearchParams(url: URL | URLSearchParams): SearchParams {
  const sp = url instanceof URL ? url.searchParams : url;
  const q = sp.get("q")?.trim() ?? "";
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");
  const radiusRaw = sp.get("radius");
  const dateFromRaw = sp.get("date_from");
  const dateToRaw = sp.get("date_to");

  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : null;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : null;
  const radius =
    radiusRaw != null && radiusRaw !== "" ? Number(radiusRaw) : null;
  const dateFrom =
    dateFromRaw != null && dateFromRaw !== "" ? Number(dateFromRaw) : null;
  const dateTo =
    dateToRaw != null && dateToRaw !== "" ? Number(dateToRaw) : null;

  const semanticRaw = (sp.get("semantic") ?? "").trim().toLowerCase();
  const semanticOff =
    semanticRaw === "0" ||
    semanticRaw === "false" ||
    semanticRaw === "no" ||
    semanticRaw === "off";
  // Default on; only an explicit opt-out disables the boost.
  const semantic = !semanticOff;

  return {
    q,
    lat: lat != null && !Number.isNaN(lat) ? lat : null,
    lng: lng != null && !Number.isNaN(lng) ? lng : null,
    radius: radius != null && !Number.isNaN(radius) ? radius : null,
    bbox: parseBBox(sp.get("bbox")),
    dateFrom: dateFrom != null && !Number.isNaN(dateFrom) ? dateFrom : null,
    dateTo: dateTo != null && !Number.isNaN(dateTo) ? dateTo : null,
    tags: parseListParam(sp, "tag"),
    vocabularies: parseListParam(sp, "vocab"),
    types: parseListParam(sp, "type"),
    semantic,
  };
}

export function buildSearchParams(input: {
  q?: string;
  lat?: number | null;
  lng?: number | null;
  radius?: number | null;
  bbox?: SearchBBox | null;
  dateFrom?: number | string | null;
  dateTo?: number | string | null;
  tags?: string[] | null;
  vocabularies?: string[] | null;
  types?: string[] | null;
  semantic?: boolean | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  const q = (input.q ?? "").trim();
  if (q) params.set("q", q);
  // Boost is default-on; only persist an explicit opt-out.
  if (input.semantic === false) params.set("semantic", "0");

  // Prefer explicit map-view bbox over point+radius when both present.
  if (input.bbox) {
    params.set("bbox", formatBBox(input.bbox));
  } else if (
    input.lat != null &&
    input.lng != null &&
    !Number.isNaN(input.lat) &&
    !Number.isNaN(input.lng)
  ) {
    params.set("lat", String(input.lat));
    params.set("lng", String(input.lng));
    const r =
      input.radius != null && !Number.isNaN(Number(input.radius))
        ? Number(input.radius)
        : DEFAULT_SEARCH_RADIUS;
    params.set("radius", String(r));
  }

  const df =
    typeof input.dateFrom === "string"
      ? input.dateFrom.trim()
      : input.dateFrom;
  const dt =
    typeof input.dateTo === "string" ? input.dateTo.trim() : input.dateTo;
  if (df !== "" && df != null && !Number.isNaN(Number(df))) {
    params.set("date_from", String(df));
  }
  if (dt !== "" && dt != null && !Number.isNaN(Number(dt))) {
    params.set("date_to", String(dt));
  }

  const seenTag = new Set<string>();
  for (const t of input.tags ?? []) {
    const v = t.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seenTag.has(k)) continue;
    seenTag.add(k);
    params.append("tag", v);
  }
  const seenVocab = new Set<string>();
  for (const v of input.vocabularies ?? []) {
    const s = v.trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seenVocab.has(k)) continue;
    seenVocab.add(k);
    params.append("vocab", s);
  }
  const seenType = new Set<string>();
  for (const t of input.types ?? []) {
    const s = t.trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seenType.has(k)) continue;
    seenType.add(k);
    params.append("type", s);
  }

  return params;
}

export function searchHref(input: Parameters<typeof buildSearchParams>[0]): string {
  const params = buildSearchParams(input);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function hasActiveSearch(p: SearchParams): boolean {
  return (
    Boolean(p.q) ||
    p.bbox != null ||
    (p.lat != null && p.lng != null) ||
    p.dateFrom != null ||
    p.dateTo != null ||
    p.tags.length > 0 ||
    p.vocabularies.length > 0 ||
    p.types.length > 0
  );
}

/** Envelope from project GeoJSON Polygon / MultiPolygon / GeometryCollection. */
export function bboxFromGeoJSON(raw: string | null | undefined): SearchBBox | null {
  if (!raw?.trim()) return null;
  try {
    const g = JSON.parse(raw) as {
      type?: string;
      coordinates?: unknown;
      geometries?: Array<{ type?: string; coordinates?: unknown }>;
    };
    const coords: number[][] = [];
    const walk = (c: unknown) => {
      if (!Array.isArray(c) || c.length === 0) return;
      if (typeof c[0] === "number") {
        coords.push(c as number[]);
        return;
      }
      for (const x of c) walk(x);
    };
    if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) {
      for (const part of g.geometries) walk(part.coordinates);
    } else {
      walk(g.coordinates);
    }
    if (coords.length === 0) return null;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [x, y] of coords) {
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (x < west) west = x;
      if (x > east) east = x;
      if (y < south) south = y;
      if (y > north) north = y;
    }
    if (!Number.isFinite(west)) return null;
    return parseBBox(`${west},${south},${east},${north}`);
  } catch {
    return null;
  }
}

export function formatYear(y: number): string {
  if (y < 0) return `${Math.abs(y)} BCE`;
  return `${y} CE`;
}

export function formatDateSpan(
  start: number | null | undefined,
  end: number | null | undefined,
): string | null {
  if (start == null && end == null) return null;
  if (start != null && end != null && start !== end) {
    return `${formatYear(start)}–${formatYear(end)}`;
  }
  if (start != null) return formatYear(start);
  if (end != null) return formatYear(end);
  return null;
}

export function formatRadius(m: number): string {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}
