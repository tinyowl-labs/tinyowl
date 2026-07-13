/** Shared URL vocabulary for `/search` discovery. */

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

  return {
    q,
    lat: lat != null && !Number.isNaN(lat) ? lat : null,
    lng: lng != null && !Number.isNaN(lng) ? lng : null,
    radius: radius != null && !Number.isNaN(radius) ? radius : null,
    bbox: parseBBox(sp.get("bbox")),
    dateFrom: dateFrom != null && !Number.isNaN(dateFrom) ? dateFrom : null,
    dateTo: dateTo != null && !Number.isNaN(dateTo) ? dateTo : null,
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
}): URLSearchParams {
  const params = new URLSearchParams();
  const q = (input.q ?? "").trim();
  if (q) params.set("q", q);

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
    p.dateTo != null
  );
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
