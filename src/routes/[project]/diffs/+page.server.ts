import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  const slug = params.project;
  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let diffs: Array<{
    id: number;
    project_slug: string;
    seq: number;
    sha256: string;
    parent_sha: string | null;
    entity_count: number;
    byte_size: number;
    created_at: string;
  }> = [];

  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/diffs`,
      { headers },
    );
    if (res.ok) diffs = await res.json();
  } catch (_) {}

  return { diffs };
};
