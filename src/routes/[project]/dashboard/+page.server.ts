import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  const slug = params.project;
  const { user } = await locals.getSession();
  if (!user) throw redirect(303, `/${slug}`);

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // Check role — only collaborator+
  let role = "viewer";
  if (accessToken) {
    try {
      const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const projects: { slug: string; role: string }[] = await res.json();
        const member = projects.find((p) => p.slug === slug);
        if (member) role = member.role;
      }
    } catch (_) {}
  }

  if (role !== "owner" && role !== "admin" && role !== "collaborator") {
    throw redirect(303, `/${slug}`);
  }

  // Tables
  let tables: { name: string; count: number }[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      const tblMap = data.tables as Record<string, string[]>;
      const counts = (data.counts ?? {}) as Record<string, number>;
      tables = Object.keys(tblMap).map((name) => ({
        name,
        count: counts[name] ?? 0,
      }));
    }
  } catch (_) {}

  // Warnings
  let warnings: any[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/warnings?limit=10`,
      { headers },
    );
    if (res.ok) warnings = await res.json();
  } catch (_) {}

  // Diffs
  let diffs: any[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/diffs`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      diffs = (Array.isArray(data) ? data : (data.diffs ?? [])).slice(0, 10);
    }
  } catch (_) {}

  // Mappings
  let mappings: any[] = [];
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/${slug}/column-mappings`,
      { headers },
    );
    if (res.ok) mappings = await res.json();
  } catch (_) {}

  return { tables, warnings, diffs, mappings };
};
