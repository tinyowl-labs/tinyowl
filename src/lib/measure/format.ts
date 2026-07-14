import type { MeasureMode, MeasureVertex } from "./types";

/** Format measure values for UI labels. */

export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1) return `${Math.round(meters * 1000)} mm`;
  if (meters < 100)
    return `${(Math.round(meters * 100) / 100).toLocaleString()} m`;
  if (meters < 1000)
    return `${(Math.round(meters * 10) / 10).toLocaleString()} m`;
  return `${(Math.round((meters / 1000) * 100) / 100).toLocaleString()} km`;
}

export function formatAreaSqMeters(sqMeters: number): string {
  if (!Number.isFinite(sqMeters) || sqMeters < 0) return "—";
  if (sqMeters < 10_000) {
    return `${(Math.round(sqMeters * 10) / 10).toLocaleString()} m²`;
  }
  return `${(Math.round((sqMeters / 10_000) * 100) / 100).toLocaleString()} ha`;
}

function formatLon(lon: number): string {
  const hemi = lon >= 0 ? "E" : "W";
  return `${Math.abs(lon).toFixed(6)}° ${hemi}`;
}

function formatLat(lat: number): string {
  const hemi = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(6)}° ${hemi}`;
}

/** Lon/lat (and optional ellipsoidal height) for point readout. */
export function formatCoordinates(
  v: MeasureVertex,
  opts?: { withHeight?: boolean },
): string {
  const base = `${formatLon(v.lon)}, ${formatLat(v.lat)}`;
  if (
    opts?.withHeight &&
    v.height != null &&
    Number.isFinite(v.height)
  ) {
    return `${base}, ${v.height.toFixed(1)} m`;
  }
  return base;
}

export function formatMeasureValue(
  mode: MeasureMode,
  value: number,
  vertices?: MeasureVertex[],
): string {
  if (mode === "point") {
    const v = vertices?.[0];
    return v
      ? formatCoordinates(v, { withHeight: v.height != null })
      : "—";
  }
  return mode === "area"
    ? formatAreaSqMeters(value)
    : formatDistanceMeters(value);
}
