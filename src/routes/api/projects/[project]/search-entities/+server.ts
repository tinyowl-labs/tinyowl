import { TINYOWL_CORE_URL } from "$env/static/private";
import type { RequestHandler } from "./$types";

/** Proxy authenticated entity search for lazy expand on /search. */
export const GET: RequestHandler = async ({ locals, params, url, fetch }) => {
  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const q = url.searchParams.get("q") ?? "";
  const limit = url.searchParams.get("limit") ?? "8";
  const upstream = new URL(
    `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/search-entities`,
  );
  upstream.searchParams.set("q", q);
  upstream.searchParams.set("limit", limit);

  const res = await fetch(upstream.toString(), { headers });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
};
