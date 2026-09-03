/** OSMF standard raster tiles — no API key.
 *  https://operations.osmfoundation.org/policies/tiles/ */
export const OSM_TILE_URL =
	"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_TILE_SUBDOMAINS = ["a", "b", "c"];
export const OSM_TILE_SIZE = 256;
/** Web Mercator usable latitude (EPSG:3857). OSM tiles do not exist beyond this. */
export const OSM_MAX_LAT = 85.05112878;
/** z=2 is ~1024px world-wide — lowest that fills a typical map without grey padding. */
export const OSM_MIN_ZOOM = 2;
export const OSM_MAX_ZOOM = 19;
export const OSM_WORLD_BOUNDS: [[number, number], [number, number]] = [
	[-OSM_MAX_LAT, -180],
	[OSM_MAX_LAT, 180],
];
