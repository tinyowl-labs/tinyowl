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
  if (!q) return { query: "", projects: [], entities: {} };

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // Stage 1: find matching projects
  let projects: SearchProject[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/search?q=${encodeURIComponent(q)}`,
      { headers },
    );
    if (res.ok) projects = (await res.json()) ?? [];
  } catch (_) {}

  // Stage 2: search entities in top 3 matching projects
  const entities: Record<string, EntityResult[]> = {};
  for (const proj of (projects ?? []).slice(0, 3)) {
    try {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/projects/${proj.slug}/search-entities?q=${encodeURIComponent(q)}&limit=5`,
        { headers },
      );
      if (res.ok) entities[proj.slug] = await res.json();
    } catch (_) {}
  }

  return { query: q, projects, entities };
};
