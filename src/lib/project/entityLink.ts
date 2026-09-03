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
