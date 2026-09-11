import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type TableRow = Record<string, unknown>;
export const load: PageServerLoad = async ({ locals, params, url, fetch }) => {
  const slug = params.project;
  const layer = url.searchParams.get("layer") ?? "";
  const highlight = url.searchParams.get("highlight") ?? "";
  const viewRaw = url.searchParams.get("view") ?? "";
  const dimRaw = url.searchParams.get("dim") ?? "";
  const refQS = url.searchParams.get("ref") === "main" ? "?ref=main" : "";
  // view=3d is a short form of view=map&dim=3d.
  const view =
    viewRaw === "3d" ||
    viewRaw === "map" ||
    viewRaw === "table" ||
    viewRaw === "schema"
      ? viewRaw === "3d"
        ? "map"
        : viewRaw
      : "map";
  const dim =
    viewRaw === "3d" || dimRaw === "3d"
      ? "3d"
      : dimRaw === "2d"
        ? "2d"
        : "";
  const tileset = url.searchParams.get("tileset") ?? "";
  const searchQ = (url.searchParams.get("q") ?? "").trim();
  const searchRows = url.searchParams.getAll("row").map((r) => r.trim()).filter(Boolean);

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let tables: Record<string, string[]> = {};
  let tablesError = "";
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/tables${refQS}`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    {
      const data = await res.json();
      tables = data.tables ?? {};
    }
  } catch { tablesError = "Could not load the project tables. Retry to see your data."; }

  // Table rows and media are loaded for the active table/selection in the browser.
  // Keeping metadata separate prevents schema/map navigation from fetching every row.
  const allRows: Record<string, TableRow[]> = {};
  const mediaByEntity: Record<string, { url: string; media_type: string }[]> = {};

  type SearchEntityHit = {
    entity_type: string;
    entity_id: string;
    column_name: string;
    match_value: string;
  };
  let searchHits: SearchEntityHit[] = [];
  if (searchQ || searchRows.length > 0) {
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (searchQ) qs.set("q", searchQ);
      if (layer.trim()) qs.set("layer", layer.trim());
      for (const row of searchRows) qs.append("row", row);
      if (url.searchParams.get("ref") === "main") qs.set("ref", "main");
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/search-entities?${qs}`,
        { headers },
      );
      if (res.ok) {
        const rows = await res.json();
        const all = Array.isArray(rows) ? rows : [];
        const layerKey = layer.trim().toLowerCase();
        searchHits = layerKey
          ? all.filter(
              (h: SearchEntityHit) =>
                (h.entity_type ?? "").toLowerCase() === layerKey,
            )
          : all;
      }
    } catch {
      /* best-effort */
    }
  }

  // Find which page the highlighted row is on (25 rows per page)
  let highlightPage = 0;
  const highlightFromSearch =
    !highlight && searchHits.length > 0
      ? searchHits[0]!.entity_id
      : highlight;
  const layerFromSearch =
    !layer && searchHits.length > 0 ? searchHits[0]!.entity_type : layer;

  return {
    tables,
    tablesError,
    rows: allRows,
    layer: layerFromSearch,
    highlight: highlightFromSearch,
    highlightPage,
    view,
    dim,
    tileset,
    mediaByEntity,
    accessToken,
    searchQ,
    searchRows,
    searchHits,
  };
};
