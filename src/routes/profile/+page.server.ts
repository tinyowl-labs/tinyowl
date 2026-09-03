import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, fetch }) => {
  const { user } = await locals.getSession();
  if (!user) return { user: null, projects: [], diffs: [], orgs: [] };

  const accessToken = await locals.getAccessToken();
  if (!accessToken) return { user, projects: [], diffs: [], orgs: [] };

  let projects: { slug: string; title: string; role: string; org_slug?: string }[] = [];
  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) projects = await res.json();
  } catch (_) {}

  let diffs: Array<{
    id: number;
    project_slug: string;
    project_title: string;
    seq: number;
    sha256: string;
    parent_sha: string | null;
    entity_count: number;
    byte_size: number;
    created_at: string;
  }> = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/profile/diffs?limit=30`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (res.ok) diffs = await res.json();
  } catch (_) {}

  let orgs: { slug: string; name: string; role: string; has_avatar: boolean }[] =
    [];
  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/orgs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) orgs = await res.json();
  } catch (_) {}

  return { user, projects, diffs, orgs };
};

export const actions: Actions = {
  create: async ({ request, locals, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const name = String(data.get("name") ?? "").trim();
    if (!name) return { error: "Project name is required." };

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const accessToken = await locals.getAccessToken();

    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ slug, title: name, description: "" }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `Failed: ${err}` };
    }

    return { success: true, slug };
  },
};
