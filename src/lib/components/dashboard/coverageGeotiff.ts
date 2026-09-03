/**
 * geotiff.js entry for LayerScene coverage. Loaded only when a raster
 * needs COG tiles or a full-file decode (not XYZ/preview-only).
 */
export { createCogImageryProvider } from "./cogImageryProvider";
export { loadCoverageImagery, resolveCoverageRectangle } from "./coverageImagery";
