import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type TableRow = Record<string, unknown>;
type MediaItem = {
  hash: string;
  entity_type: string;
  entity_id: string;
  media_type: string;
  file_size: number;
  url: string;
};

export const load: PageServerLoad = async ({ locals, params, url, fetch }) => {
  const slug = params.project;
  const layer = url.searchParams.get("layer") ?? "";
  const highlight = url.searchParams.get("highlight") ?? "";

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let tables: Record<string, string[]> = {};
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      tables = data.tables ?? {};
    }
  } catch (_) {}

  // Fetch rows for each table
  const tableNames = Object.keys(tables);
  const allRows: Record<string, TableRow[]> = {};
  for (const name of tableNames) {
    try {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables/${name}/rows`,
        { headers },
      );
      if (res.ok) {
        const data = await res.json();
        allRows[name] = data.rows ?? [];
      } else {
        allRows[name] = [];
      }
    } catch (_) {
      allRows[name] = [];
    }
  }

  // Fetch media and build entity lookup
  let mediaByEntity: Record<string, { url: string; media_type: string }[]> = {};
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/media`,
      { headers },
    );
    if (res.ok) {
      const mediaList: MediaItem[] = await res.json();
      for (const m of mediaList) {
        const key = `${m.entity_type}:${m.entity_id}`;
        if (!mediaByEntity[key]) mediaByEntity[key] = [];
        mediaByEntity[key].push({
          url: `${TINYOWL_CORE_URL}${m.url}`,
          media_type: m.media_type,
        });
      }
    }
  } catch (_) {}

  // Find which page the highlighted row is on (25 rows per page)
  let highlightPage = 0;
  if (highlight && layer) {
    const tableRows = allRows[layer] ?? [];
    const idx = tableRows.findIndex(
      (r) => (r.source_id ?? r.SOURCE_ID ?? "") === highlight,
    );
    if (idx >= 0) highlightPage = Math.floor(idx / 25);
  }

  return {
    tables,
    rows: allRows,
    layer,
    highlight,
    highlightPage,
    mediaByEntity,
  };
};
