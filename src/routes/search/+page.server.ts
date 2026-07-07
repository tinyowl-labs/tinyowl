import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type SearchProject = {
  slug: string;
  title: string;
  description: string | null;
  entity_count: number;
  table_count: number;
  bbox: string | null;
  match_detail: string;
  distance_m?: number;
};

type EntityResult = {
  entity_type: string;
  entity_id: string;
  column_name: string;
  match_value: string;
  project_slug: string;
};

export const load: PageServerLoad = async ({ url, locals, fetch }) => {
  const q = url.searchParams.get("q")?.trim();
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const radius = url.searchParams.get("radius");

  if (!q && !lat)
    return {
      query: q ?? "",
      lat: null,
      lng: null,
      radius: null,
      projects: [],
      entities: {},
    };

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // Build search URL with optional spatial params
  let searchUrl = `${TINYOWL_CORE_URL}/api/v1/search?`;
  if (q) searchUrl += `q=${encodeURIComponent(q)}`;
  if (lat) searchUrl += `${q ? "&" : ""}lat=${encodeURIComponent(lat)}`;
  if (lng) searchUrl += `&lng=${encodeURIComponent(lng)}`;
  if (radius) searchUrl += `&radius=${encodeURIComponent(radius)}`;

  // Stage 1: find matching projects
  let projects: SearchProject[] = [];
  try {
    const res = await fetch(searchUrl, { headers });
    if (res.ok) projects = (await res.json()) ?? [];
  } catch (_) {}

  // Stage 2: search entities in top 3 matching projects (only with text query)
  const entities: Record<string, EntityResult[]> = {};
  if (q) {
    for (const proj of (projects ?? []).slice(0, 3)) {
      try {
        const res = await fetch(
          `${TINYOWL_CORE_URL}/api/v1/projects/${proj.slug}/search-entities?q=${encodeURIComponent(q)}&limit=5`,
          { headers },
        );
        if (res.ok) entities[proj.slug] = await res.json();
      } catch (_) {}
    }
  }

  return {
    query: q ?? "",
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
    radius: radius ? parseInt(radius) : null,
    projects,
    entities,
  };
};
