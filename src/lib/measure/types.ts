/** Shared measure types for Leaflet (2D) and Cesium (3D). */

/** point = coordinate readout; length = 2+ vertex path; area = closed ring. */
export type MeasureMode = "point" | "length" | "area";

/** Lon/lat; optional height metres (ellipsoidal) for 3D. */
export type MeasureVertex = {
  lon: number;
  lat: number;
  height?: number;
};

export type MeasureRecord = {
  id: string;
  mode: MeasureMode;
  /** Label already formatted for display. */
  label: string;
  /** Metres (length), m² (area), or unused 0 for point. */
  value: number;
  vertices: MeasureVertex[];
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
  return "Click ring · Finish at 3+ points";
}
