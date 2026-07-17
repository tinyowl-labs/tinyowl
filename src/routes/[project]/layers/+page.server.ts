import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type TableRow = Record<string, unknown>;
type MediaItem = {
  hash: string;
  media_type: string;
  file_size: number;
  url: string;
  entities?: Array<{ entity_type: string; entity_id: string }>;
  // legacy flat fields (if any)
  entity_type?: string;
  entity_id?: string;
};

export const load: PageServerLoad = async ({ locals, params, url, fetch }) => {
  const slug = params.project;
  const layer = url.searchParams.get("layer") ?? "";
  const highlight = url.searchParams.get("highlight") ?? "";
  const viewRaw = url.searchParams.get("view") ?? "";
  const dimRaw = url.searchParams.get("dim") ?? "";
  // view=3d is a short form of view=map&dim=3d.
  const view =
    viewRaw === "3d" ||
    viewRaw === "map" ||
    viewRaw === "table" ||
    viewRaw === "schema"
      ? viewRaw === "3d"
        ? "map"
        : viewRaw
      : highlight
        ? "map"
        : "";
  const dim =
    viewRaw === "3d" || dimRaw === "3d"
      ? "3d"
      : dimRaw === "2d"
        ? "2d"
        : "";
  const tileset = url.searchParams.get("tileset") ?? "";

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
      const body = await res.json();
      const mediaList: MediaItem[] = Array.isArray(body)
        ? body
        : (body.items ?? []);
      for (const m of mediaList) {
        const links =
          m.entities && m.entities.length > 0
            ? m.entities
            : m.entity_type && m.entity_id
              ? [{ entity_type: m.entity_type, entity_id: m.entity_id }]
              : [];
        for (const link of links) {
          const key = `${link.entity_type}:${link.entity_id}`;
          if (!mediaByEntity[key]) mediaByEntity[key] = [];
          mediaByEntity[key].push({
            url: `${TINYOWL_CORE_URL}${m.url}`,
            media_type: m.media_type,
          });
        }
      }
    }
  } catch (_) {}

  // Find which page the highlighted row is on (25 rows per page)
  let highlightPage = 0;
  if (highlight && layer) {
    const tableNames = Object.keys(allRows);
    const resolved =
      allRows[layer] != null
        ? layer
        : (tableNames.find((t) => t.toLowerCase() === layer.toLowerCase()) ??
          layer);
    const tableRows = allRows[resolved] ?? [];
    const idx = tableRows.findIndex(
      (r) => String(r.source_id ?? r.SOURCE_ID ?? "") === highlight,
    );
    if (idx >= 0) highlightPage = Math.floor(idx / 25);
  }

  return {
    tables,
    rows: allRows,
    layer,
    highlight,
    highlightPage,
    view,
    dim,
    tileset,
    mediaByEntity,
    accessToken,
  };
};
