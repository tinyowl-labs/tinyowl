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
  /** Restrict discovery to these project slugs (`?project=` repeated) */
  projects: string[];
  /** Result kinds — scaffold; always project until mixed search ships */
  types: string[];
  /**
   * OpenCLIP text boost when q is set. Default on; opt out with `?semantic=0`.
   * Omitted from normal URLs — only `semantic=0` is written when disabled.
   */
  semantic: boolean;
  /** Query was compiled from optional Smart terms; enables broadened ranking. */
  smart?: boolean;
  /** Reverse-image seed (`?media_hash=`); catalogue hash path. */
  mediaHash: string | null;
  /** Temp query-by-image session (`?image=1`); results live in sessionStorage. */
  imageQuery: boolean;
  /** Gazetteer label for a point filter (`?place=`), display-only. */
  placeName: string | null;
  /** ISO A2 country polygon filter (`?cc=`). */
  countryCode: string | null;
  /** PeriodO ARK for a named when-filter (`?term=`). */
  termUri: string | null;
  /** PeriodO prefLabel for the chip (`?period=`), display-only. */
  periodLabel: string | null;
  /** AAT (subject) URI (`?concept=`). */
  conceptUri: string | null;
  /** AAT prefLabel for the chip (`?subject=`), display-only. */
  subjectLabel: string | null;
  /** Opt-in closeMatch expansion (`?match=close`), inspect only. */
  matchClose: boolean;
  /** Opt-in immediate narrower expansion (`?match=narrower`), inspect only. */
  matchNarrower: boolean;
};

export const DEFAULT_SEARCH_RADIUS = 5000;

export function formatBBox(b: SearchBBox): string {
  return `${b.west},${b.south},${b.east},${b.north}`;
}

export function parseCountryCode(raw: string | null | undefined): string | null {
  const cc = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return cc;
}

export function parseBBox(raw: string | null | undefined): SearchBBox | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  let [west, south, east, north] = parts;
  west = Math.max(-180, Math.min(180, west));
  east = Math.max(-180, Math.min(180, east));
  south = Math.max(-90, Math.min(90, south));
  north = Math.max(-90, Math.min(90, north));
  if (west > east) [west, east] = [east, west];
  if (south > north) [south, north] = [north, south];
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

function parseMatchFlags(sp: URLSearchParams): {
  matchClose: boolean;
  matchNarrower: boolean;
} {
  let matchClose = false;
  let matchNarrower = false;
  for (const raw of sp.getAll("match")) {
    const v = raw.trim().toLowerCase();
    if (v === "close") matchClose = true;
    if (v === "narrower" || v === "narrow") matchNarrower = true;
  }
  return { matchClose, matchNarrower };
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
  const smartRaw = (sp.get("smart") ?? "").trim().toLowerCase();
  const smart = smartRaw === "1" || smartRaw === "true" || smartRaw === "yes";

  const mediaRaw = (sp.get("media_hash") ?? "").trim().toLowerCase();
  const mediaHash =
    /^[0-9a-f]{16,}$/.test(mediaRaw) ? mediaRaw : null;
  const imageFlag = (sp.get("image") ?? "").trim().toLowerCase();
  const imageQuery =
    imageFlag === "1" || imageFlag === "true" || imageFlag === "yes";
  const { matchClose, matchNarrower } = parseMatchFlags(sp);
  const cc = parseCountryCode(sp.get("cc"));

  return {
    q,
    lat: cc || lat == null || Number.isNaN(lat) ? null : lat,
    lng: cc || lng == null || Number.isNaN(lng) ? null : lng,
    radius: cc || radius == null || Number.isNaN(radius) ? null : radius,
    bbox: cc ? null : parseBBox(sp.get("bbox")),
    dateFrom: dateFrom != null && !Number.isNaN(dateFrom) ? dateFrom : null,
    dateTo: dateTo != null && !Number.isNaN(dateTo) ? dateTo : null,
    tags: parseListParam(sp, "tag"),
    vocabularies: parseListParam(sp, "vocab"),
    projects: parseListParam(sp, "project"),
    types: parseListParam(sp, "type"),
    semantic,
    smart,
    mediaHash,
    imageQuery,
    placeName: (sp.get("place") ?? "").trim() || null,
    countryCode: cc,
    termUri: (sp.get("term") ?? "").trim() || null,
    periodLabel: (sp.get("period") ?? "").trim() || null,
    conceptUri: (sp.get("concept") ?? "").trim() || null,
    subjectLabel: (sp.get("subject") ?? "").trim() || null,
    matchClose,
    matchNarrower,
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
  projects?: string[] | null;
  types?: string[] | null;
  semantic?: boolean | null;
  smart?: boolean | null;
  mediaHash?: string | null;
  imageQuery?: boolean | null;
  placeName?: string | null;
  countryCode?: string | null;
  termUri?: string | null;
  periodLabel?: string | null;
  conceptUri?: string | null;
  subjectLabel?: string | null;
  matchClose?: boolean | null;
  matchNarrower?: boolean | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  const q = (input.q ?? "").trim();
  if (q) params.set("q", q);
  // Boost is default-on; only persist an explicit opt-out.
  if (input.semantic === false) params.set("semantic", "0");
  if (input.smart) params.set("smart", "1");

  const media = (input.mediaHash ?? "").trim().toLowerCase();
  if (/^[0-9a-f]{16,}$/.test(media)) params.set("media_hash", media);
  if (input.imageQuery) params.set("image", "1");

  const cc = parseCountryCode(input.countryCode ?? null);
  if (cc) params.set("cc", cc);

  // Country polygon is the spatial filter — do not also persist a bbox envelope.
  if (!cc && input.bbox) {
    params.set("bbox", formatBBox(input.bbox));
  } else if (
    !cc &&
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
  const place = (input.placeName ?? "").trim();
  if (place && (cc || params.has("bbox") || params.has("lat"))) {
    params.set("place", place);
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
  const seenProject = new Set<string>();
  for (const p of input.projects ?? []) {
    const s = p.trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seenProject.has(k)) continue;
    seenProject.add(k);
    params.append("project", s);
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

  const term = (input.termUri ?? "").trim();
  if (term) params.set("term", term);
  const period = (input.periodLabel ?? "").trim();
  if (period) params.set("period", period);
  const concept = (input.conceptUri ?? "").trim();
  if (concept) params.set("concept", concept);
  const subject = (input.subjectLabel ?? "").trim();
  if (subject) params.set("subject", subject);
  if (concept && input.matchClose) params.append("match", "close");
  if (concept && input.matchNarrower) params.append("match", "narrower");

  return params;
}

export function searchHref(input: Parameters<typeof buildSearchParams>[0]): string {
  const params = buildSearchParams(input);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function hasActiveSearch(p: SearchParams): boolean {
  return (
    Boolean(p.q) ||
    Boolean(p.mediaHash) ||
    Boolean(p.imageQuery) ||
    p.bbox != null ||
    Boolean(p.countryCode) ||
    (p.lat != null && p.lng != null) ||
    p.dateFrom != null ||
    p.dateTo != null ||
    p.tags.length > 0 ||
    p.vocabularies.length > 0 ||
    p.projects.length > 0 ||
    p.types.length > 0 ||
    Boolean(p.termUri) ||
    Boolean(p.periodLabel) ||
    Boolean(p.conceptUri) ||
    Boolean(p.subjectLabel)
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

const MIN_SEARCH_RADIUS_M = 200;
const MAX_SEARCH_RADIUS_M = 20_000_000;

/** Parse chip input (`5km`, `800m`, `5.0km`, or a bare number). */
export function parseRadius(
  raw: string,
  currentMetres: number,
): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const suffixed = /^([\d.]+)(km|m)$/.exec(s);
  let metres: number;
  if (suffixed) {
    const n = Number(suffixed[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    metres = suffixed[2] === "km" ? n * 1000 : n;
  } else {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    metres = currentMetres >= 1000 ? n * 1000 : n;
  }
  if (!Number.isFinite(metres)) return null;
  return Math.min(
    MAX_SEARCH_RADIUS_M,
    Math.max(MIN_SEARCH_RADIUS_M, Math.round(metres)),
  );
}

export function formatLatLng(lat: number, lng: number, digits = 2): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}
