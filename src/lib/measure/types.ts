/** Shared measure types for Leaflet (2D) and Cesium (3D). */

/** point = coordinate readout; length = 2+ vertex path; area = closed ring; volume = cut/fill vs rim. */
export type MeasureMode = "point" | "length" | "area" | "volume";

/** Lon/lat; optional height metres (ellipsoidal) for 3D. */
export type MeasureVertex = {
  lon: number;
  lat: number;
  height?: number;
};

/** Chord-station profile: X = cumulative great-circle (m), Y = height − start (m). */
export type ProfilePoint = { x: number; y: number };

export type MeasureRecord = {
  id: string;
  mode: MeasureMode;
  /** Label already formatted for display. */
  label: string;
  /** Metres (length), m² (area), m³ (volume), or unused 0 for point. */
  value: number;
  vertices: MeasureVertex[];
  /**
   * Length profile sampled along the path (tileset/terrain between clicks).
   * Absent → fall back to click vertices only.
   */
  profile?: ProfilePoint[] | null;
  /**
   * Sampled 3D surface area (m²) for area mode. Absent → vertex TIN / planimetric.
   */
  surface3d?: number | null;
  /** Cut/fill vs mean edge Z (volume mode). */
  volume?: VolumeBreakdown | null;
};

export type VolumeSample = {
  lon: number;
  lat: number;
  height: number;
};

export type VolumeBreakdown = {
  /** m³ below mean edge height. */
  cut: number;
  /** m³ above mean edge height. */
  fill: number;
  /** Mean click-vertex height (m). */
  rim: number;
  /** max(cut, fill) unless the user toggled. */
  hero: number;
  kind: "cut" | "fill";
  /** Mean |Δh| of cut samples (m). */
  avgCut: number;
  /** Mean |Δh| of fill samples (m). */
  avgFill: number;
  /** Interior picks for globe colouring (cut=blue, fill=green). */
  samples: VolumeSample[];
};

export function measureHint(mode: MeasureMode, dim: "2d" | "3d"): string {
  if (mode === "point") {
    return dim === "3d"
      ? "Click the mesh or globe to read coordinates"
      : "Click the map to read coordinates";
  }
  if (mode === "length") {
    return "Click points · Finish at 2+ (segment or polyline)";
  }
  if (mode === "volume") {
    return dim === "3d"
      ? "Click a ring on the mesh · Finish for cut/fill"
      : "Volume needs the 3D globe";
  }
  return "Click ring · Finish at 3+ points";
}
