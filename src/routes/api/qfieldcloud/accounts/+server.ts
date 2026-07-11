import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, fetch }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    throw error(401, "Not signed in");
  }
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw error(res.status, text || "Failed to list accounts");
  }
  try {
    return json(JSON.parse(text));
  } catch {
    return json([]);
  }
};

export const POST: RequestHandler = async ({ locals, request, fetch }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    throw error(401, "Not signed in");
  }
  const body = await request.json();
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/connect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw error(res.status, text || "Connect failed");
  }
  try {
    return json(JSON.parse(text));
  } catch {
    return json({ status: "ok" });
  }
};
