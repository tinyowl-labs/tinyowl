import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import {
  formatBBox,
  hasActiveSearch,
  parseSearchParams,
} from "$lib/search/params";

export type SearchMatchHit = {
  entity_type: string;
  column_name: string;
  local_value: string;
};

export type SearchProject = {
  result_kind?: string;
  slug: string;
  title: string;
  description: string | null;
  entity_count: number;
  table_count: number;
  bbox: string | null;
  match_detail: string;
  match_snippet?: string;
  match_hits?: SearchMatchHit[];
  distance_m?: number;
  tags_manual?: string[];
  tags_auto?: string[];
  date_start?: number | null;
  date_end?: number | null;
  date_start_label?: string | null;
  date_end_label?: string | null;
};

export const load: PageServerLoad = async ({ url, locals, fetch }) => {
  const parsed = parseSearchParams(url);
  const active = hasActiveSearch(parsed);

  if (!active) {
    return {
      query: parsed.q,
      lat: null,
      lng: null,
      radius: null,
      bbox: null,
      dateFrom: null,
      dateTo: null,
      tags: [] as string[],
      vocabularies: [] as string[],
      semantic: parsed.semantic,
      projects: [] as SearchProject[],
      accessToken: null as string | null,
    };
  }

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const params = new URLSearchParams();
  if (parsed.q) params.set("q", parsed.q);
  // Boost is default-on in the API; only forward an explicit opt-out.
  if (parsed.q && !parsed.semantic) params.set("semantic", "0");
  if (parsed.bbox) {
    params.set("bbox", formatBBox(parsed.bbox));
  } else if (parsed.lat != null && parsed.lng != null) {
    params.set("lat", String(parsed.lat));
    params.set("lng", String(parsed.lng));
    if (parsed.radius != null) params.set("radius", String(parsed.radius));
  }
  if (parsed.dateFrom != null) params.set("date_from", String(parsed.dateFrom));
  if (parsed.dateTo != null) params.set("date_to", String(parsed.dateTo));
  for (const t of parsed.tags) params.append("tag", t);
  for (const v of parsed.vocabularies) params.append("vocab", v);

  let projects: SearchProject[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/search?${params.toString()}`,
      { headers },
    );
    if (res.ok) projects = (await res.json()) ?? [];
  } catch (_) {}

  return {
    query: parsed.q,
    lat: parsed.lat,
    lng: parsed.lng,
    radius: parsed.radius,
    bbox: parsed.bbox,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    tags: parsed.tags,
    vocabularies: parsed.vocabularies,
    semantic: parsed.semantic,
    projects,
    accessToken,
  };
};
