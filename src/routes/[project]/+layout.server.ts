import type { LayoutServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: LayoutServerLoad = async ({ locals, params, fetch }) => {
  const { user } = await locals.getSession();
  const slug = params.project;

  let isMember = false;

  // Fetch public project details
  let project: {
    slug: string;
    title: string;
    description?: string | null;
    gpkg_uri?: string | null;
    media_uri?: string | null;
    entity_count?: number | null;
    table_count?: number | null;
    updated_at?: string | null;
  } | null = null;

  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`);
    if (res.ok) project = await res.json();
  } catch (_) {}

  // Check membership if logged in
  if (user && project) {
    try {
      const accessToken = await locals.getAccessToken();
      const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const projects: { slug: string }[] = await res.json();
        isMember = projects.some((p) => p.slug === slug);
      }
    } catch (_) {}
  }

  if (!project) {
    project = { slug, title: slug };
  }

  return { user, project, isMember, slug };
};
