import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    throw error(401, "Not signed in");
  }
  const id = params.id;
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts/${id}/projects`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw error(res.status, text || "Failed to list Cloud projects");
  }
  try {
    return json(JSON.parse(text));
  } catch {
    return json([]);
  }
};
