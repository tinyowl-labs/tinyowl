import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    throw error(401, "Not signed in");
  }
  const slug = params.slug;
  if (!slug) {
    throw error(400, "slug required");
  }
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/qfieldcloud-link`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw error(res.status, text || "Failed to load link");
  }
  try {
    return json(JSON.parse(text));
  } catch {
    return json(null);
  }
};
