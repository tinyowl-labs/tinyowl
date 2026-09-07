import { lengthBreakdown, type LengthBreakdown } from "./geo";
import type { MeasureMode, MeasureVertex } from "./types";

/** Show H/V when |vertical| is at least this fraction of 3D length. */
const HV_FRACTION = 0.05;

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

function formatAreaSqMeters(sqMeters: number): string {
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
function formatCoordinates(
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

export function formatLengthSubtext(
  vertices: MeasureVertex[],
  breakdown?: LengthBreakdown,
): string | null {
  const b = breakdown ?? lengthBreakdown(vertices);
  if (!b.hasHeight || b.length3d <= 0) return null;
  if (Math.abs(b.vertical) < HV_FRACTION * b.length3d) return null;
  const arrow = b.vertical >= 0 ? "↑" : "↓";
  return `H ${formatDistanceMeters(b.horizontal)} · ${arrow} ${formatDistanceMeters(Math.abs(b.vertical))}`;
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
