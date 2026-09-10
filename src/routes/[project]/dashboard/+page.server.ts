import type { PageServerLoad } from "./$types";
import {
  coreJson,
  jsonArray,
  projectAuth,
} from "$lib/server/projectAccess.server";

export const load: PageServerLoad = async ({ locals, params, fetch, parent }) => {
  const slug = params.project;
  const { accessToken, headers } = await projectAuth(
    locals,
    parent,
    slug,
    "writer",
  );

  let tables: { name: string; count: number }[] = [];
  const tablesPayload = await coreJson(
    fetch,
    `/api/v1/projects/${encodeURIComponent(slug)}/tables`,
    headers,
  );
  if (tablesPayload && typeof tablesPayload === "object") {
    const tblMap = ((tablesPayload as any).tables ?? {}) as Record<
      string,
      string[]
    >;
    const counts = ((tablesPayload as any).counts ?? {}) as Record<
      string,
      number
    >;
    tables = Object.keys(tblMap).map((name) => ({
      name,
      count: counts[name] ?? 0,
    }));
  }

  const warnings = jsonArray(
    await coreJson(
      fetch,
      `/api/v1/projects/${encodeURIComponent(slug)}/warnings?limit=10`,
      headers,
    ),
  );

  const diffs = jsonArray(
    await coreJson(fetch, `/api/v1/projects/${encodeURIComponent(slug)}/diffs`, headers),
    "diffs",
  ).slice(0, 10);

  const pendingChangesets = jsonArray(
    await coreJson(
      fetch,
      `/api/v1/projects/${encodeURIComponent(slug)}/changesets?status=pending`,
      headers,
    ),
  );

  const developCommits = jsonArray(
    await coreJson(
      fetch,
      `/api/v1/projects/${encodeURIComponent(slug)}/commits?ref=develop`,
      headers,
    ),
  ).slice(0, 10);

  const conflictedCommits = jsonArray(
    await coreJson(
      fetch,
      `/api/v1/projects/${encodeURIComponent(slug)}/commits?status=conflicted`,
      headers,
    ),
  );

  const mappings = jsonArray(
    await coreJson(
      fetch,
      `/api/v1/projects/${encodeURIComponent(slug)}/value-mappings`,
      headers,
    ),
  );

  return {
    tables,
    warnings,
    diffs,
    pendingChangesets,
    developCommits,
    conflictedCommits,
    mappings,
    accessToken,
  };
};
