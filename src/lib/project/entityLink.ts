import {
  formatBBox,
  DEFAULT_SEARCH_RADIUS,
} from "$lib/search/params";
import type { PlaceHit } from "$lib/search/placeHit";

/** Build a deep link into a project's Layers page for a specific entity. */

export type EntityLinkOpts = {
  layer: string;
  highlight: string;
  /** Prefer map for spatial focus; table when explicitly requested. */
  view?: "table" | "map" | "schema";
};

export function entityLayersHref(
  projectSlug: string,
  opts: EntityLinkOpts,
): string {
  const params = new URLSearchParams();
  if (opts.layer) params.set("layer", opts.layer);
  if (opts.highlight) params.set("highlight", opts.highlight);
  params.set("view", opts.view ?? "map");
  const qs = params.toString();
  return `/${projectSlug}/layers${qs ? `?${qs}` : ""}`;
}

/** Open a project's map, optionally with a cell/value query (`?q=`). */
export function projectLayersSearchHref(
  projectSlug: string,
  q: string,
): string {
  const params = new URLSearchParams();
  params.set("view", "map");
  const query = q.trim();
  if (query) params.set("q", query);
  return `/${projectSlug}/layers?${params}`;
}

/** Focus a named layer on the project map. */
export function projectLayerHref(
  projectSlug: string,
  layerName: string,
): string {
  const params = new URLSearchParams();
  params.set("view", "map");
  params.set("layer", layerName);
  return `/${projectSlug}/layers?${params}`;
}

/** Open the artefacts gallery on a specific media hash. */
export function projectArtefactHref(
  projectSlug: string,
  hash: string,
): string {
  const params = new URLSearchParams();
  if (hash) params.set("media", hash);
  const qs = params.toString();
  return `/${projectSlug}/artefacts${qs ? `?${qs}` : ""}`;
}

/** Apply a gazetteer hit as a camera/filter target on the project map. */
export function projectLayersPlaceHref(
  projectSlug: string,
  place: PlaceHit,
): string {
  const params = new URLSearchParams();
  params.set("view", "map");
  if (place.label) params.set("place", place.label);
  const geom = place.geom;
  if (geom.type === "bbox") {
    params.set(
      "bbox",
      formatBBox({
        west: geom.west,
        south: geom.south,
        east: geom.east,
        north: geom.north,
      }),
    );
  } else {
    params.set("lat", String(geom.lat));
    params.set("lng", String(geom.lng));
    params.set("radius", String(geom.radius ?? DEFAULT_SEARCH_RADIUS));
  }
  return `/${projectSlug}/layers?${params}`;
}
