import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals, params, fetch }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    throw error(401, "Not signed in");
  }
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts/${params.id}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw error(res.status, (await res.text()) || "Disconnect failed");
  }
  return json({ status: "deleted" });
};
