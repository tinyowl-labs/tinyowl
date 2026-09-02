import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, fetch, url }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    throw error(401, "Not signed in");
  }
  const qs = url.searchParams.toString();
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/integrations/opencontext/projects${qs ? `?${qs}` : ""}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw error(res.status, text || "Failed to list Open Context projects");
  }
  try {
    return json(JSON.parse(text));
  } catch {
    return json({ total: 0, projects: [] });
  }
};
