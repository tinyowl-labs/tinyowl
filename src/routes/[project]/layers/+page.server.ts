import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { tableHasGeom } from "$lib/project/schemaFields";

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
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/tables${refQS}`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      tables = data.tables ?? {};
    }
  } catch (_) {}

  const tableNames = Object.keys(tables);
  const loadSpatialRows = view === "table" || view === "schema";
  const allRows: Record<string, TableRow[]> = {};
  await Promise.all(
    tableNames.map(async (name) => {
      if (!loadSpatialRows && tableHasGeom(tables[name])) {
        allRows[name] = [];
        return;
      }
      try {
        const res = await fetch(
          `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/tables/${encodeURIComponent(name)}/rows${refQS}`,
          { headers },
        );
        allRows[name] = res.ok ? ((await res.json()).rows ?? []) : [];
      } catch (_) {
        allRows[name] = [];
      }
    }),
  );

  // Fetch media and build entity lookup. API caps at 200/page (default 50) —
  // page through so map/table thumbs are not limited to the newest slice.
  let mediaByEntity: Record<string, { url: string; media_type: string }[]> = {};
  try {
    const pageSize = 200;
    let offset = 0;
    for (;;) {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/media?limit=${pageSize}&offset=${offset}`,
        { headers },
      );
      if (!res.ok) break;
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
          const entry = {
            url: m.url?.startsWith("/")
              ? m.url
              : `/media/${m.hash}`,
            media_type: m.media_type,
          };
          // Prefer images first so table/map chrome isn't an audio octet stub.
          if (m.media_type?.startsWith("image/")) {
            mediaByEntity[key].unshift(entry);
          } else {
            mediaByEntity[key].push(entry);
          }
        }
      }
      offset += mediaList.length;
      if (mediaList.length < pageSize) break;
      // Distinct-hash pagination: empty page or runaway offset → stop.
      if (mediaList.length === 0 || offset > 100_000) break;
    }
  } catch (_) {}

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
  if (highlightFromSearch && layerFromSearch) {
    const names = Object.keys(allRows);
    const resolved =
      allRows[layerFromSearch] != null
        ? layerFromSearch
        : (names.find(
            (t) => t.toLowerCase() === layerFromSearch.toLowerCase(),
          ) ?? layerFromSearch);
    const tableRows = allRows[resolved] ?? [];
    const idx = tableRows.findIndex(
      (r) =>
        String(r.source_id ?? r.SOURCE_ID ?? "") === highlightFromSearch,
    );
    if (idx >= 0) highlightPage = Math.floor(idx / 25);
  }

  return {
    tables,
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
