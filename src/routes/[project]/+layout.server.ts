import type { LayoutServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: LayoutServerLoad = async ({ locals, params, fetch }) => {
  const { user } = await locals.getSession();
  const slug = params.project;

  let isMember = false;
  let role = "viewer";

  // Fetch project details (with auth if logged in for private projects)
  let project: {
    slug: string;
    title: string;
    description?: string | null;
    gpkg_uri?: string | null;
    media_uri?: string | null;
    entity_count?: number | null;
    table_count?: number | null;
    updated_at?: string | null;
    machine?: string | null;
    tags_manual?: string[];
    tags_auto?: string[];
    bbox?: string | null;
    date_start?: number | null;
    date_end?: number | null;
    date_start_label?: string | null;
    date_end_label?: string | null;
  } | null = null;

  try {
    const accessToken = await locals.getAccessToken();
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
      headers,
    });
    if (res.ok) project = await res.json();
  } catch (_) {}

  // Check membership if logged in
  if (user && project) {
    try {
      const accessToken = await locals.getAccessToken();
      if (accessToken) {
        const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const projects: { slug: string; role: string }[] = await res.json();
          const member = projects.find((p) => p.slug === slug);
          if (member) {
            isMember = true;
            role = member.role;
          }
        }
      }
    } catch (_) {}
  }

  if (!project) {
    project = { slug, title: slug };
  }

  return { user, project, isMember, role, slug };
};
