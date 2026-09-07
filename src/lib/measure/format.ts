import {
  areaBreakdown,
  lengthBreakdown,
  type AreaBreakdown,
  type LengthBreakdown,
} from "./geo";
import type {
  MeasureMode,
  MeasureVertex,
  VolumeBreakdown,
} from "./types";

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

/** Trench-scale ladder: mL / L / m³. */
export function formatVolumeCubicMeters(m3: number): string {
  if (!Number.isFinite(m3) || m3 < 0) return "—";
  if (m3 < 0.001) return `${Math.round(m3 * 1e6)} mL`;
  if (m3 < 1) {
    const litres = Math.round(m3 * 1000 * 10) / 10;
    return `${litres.toLocaleString()} L`;
  }
  if (m3 < 100) {
    return `${(Math.round(m3 * 100) / 100).toLocaleString()} m³`;
  }
  return `${(Math.round(m3 * 10) / 10).toLocaleString()} m³`;
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

/** Planimetric H when 3D surface is materially larger (same 5% rule as length). */
export function formatAreaSubtext(
  vertices: MeasureVertex[],
  sampledSurface?: number | null,
  breakdown?: AreaBreakdown,
): string | null {
  const b = breakdown ?? areaBreakdown(vertices, sampledSurface);
  if (!b.hasHeight || b.hero <= 0) return null;
  if (Math.abs(b.surface3d - b.planimetric) < HV_FRACTION * b.hero) return null;
  return `H ${formatAreaSqMeters(b.planimetric)}`;
}

export function formatVolumeHero(vol: VolumeBreakdown): string {
  const tag = vol.kind === "cut" ? "Cut" : "Fill";
  return `${tag} ${formatVolumeCubicMeters(vol.hero)}`;
}

/** The other of cut/fill, plus mean Δh (injalak subtext). */
export function formatVolumeSubtext(vol: VolumeBreakdown): string | null {
  const parts: string[] = [];
  const other = vol.kind === "cut" ? vol.fill : vol.cut;
  if (other >= 1e-6) {
    const tag = vol.kind === "cut" ? "Fill" : "Cut";
    parts.push(`${tag} ${formatVolumeCubicMeters(other)}`);
  }
  const dh = vol.kind === "cut" ? vol.avgCut : vol.avgFill;
  if (dh > 0.001) parts.push(`Δh ${formatDistanceMeters(dh)}`);
  return parts.length ? parts.join(" · ") : null;
}

export function formatMeasureValue(
  mode: MeasureMode,
  value: number,
  vertices?: MeasureVertex[],
  extra?: { volume?: VolumeBreakdown | null },
): string {
  if (mode === "point") {
    const v = vertices?.[0];
    return v
      ? formatCoordinates(v, { withHeight: v.height != null })
      : "—";
  }
  if (mode === "area") return formatAreaSqMeters(value);
  if (mode === "volume") {
    return extra?.volume
      ? formatVolumeHero(extra.volume)
      : formatVolumeCubicMeters(value);
  }
  return formatDistanceMeters(value);
}
