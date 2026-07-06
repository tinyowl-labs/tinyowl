import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type TableRow = Record<string, unknown>;

export const load: PageServerLoad = async ({ params, url, fetch }) => {
  const slug = params.project;
  const layer = url.searchParams.get("layer") ?? "";
  const highlight = url.searchParams.get("highlight") ?? "";

  let tables: Record<string, string[]> = {};
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables`,
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

  // Find which page the highlighted row is on (25 rows per page)
  let highlightPage = 0;
  if (highlight && layer) {
    const tableRows = allRows[layer] ?? [];
    const idx = tableRows.findIndex(
      (r) => (r.source_id ?? r.SOURCE_ID ?? "") === highlight,
    );
    if (idx >= 0) highlightPage = Math.floor(idx / 25);
  }

  return { tables, rows: allRows, layer, highlight, highlightPage };
};
