import { TINYOWL_CORE_URL } from "$env/static/private";
import type { RequestHandler } from "./$types";

/** Proxy authenticated download of mappings.toml for the project. */
export const GET: RequestHandler = async ({ locals, params, fetch }) => {
  const accessToken = await locals.getAccessToken();
  if (!accessToken) {
    return new Response("Sign in required", { status: 401 });
  }
  const res = await fetch(
    `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/mappings.toml`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    return new Response(await res.text(), { status: res.status });
  }
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/toml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${params.project}-mappings.toml"`,
    },
  });
};
