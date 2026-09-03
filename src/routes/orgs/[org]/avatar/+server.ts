import { TINYOWL_CORE_URL } from "$env/static/private";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
	const token = await locals.getAccessToken();
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(
		`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/avatar`,
		{ headers },
	);
	if (!res.ok) {
		return new Response(null, { status: res.status });
	}
	const buf = await res.arrayBuffer();
	return new Response(buf, {
		headers: {
			"Content-Type": res.headers.get("Content-Type") ?? "image/png",
			"Cache-Control": "public, max-age=60",
		},
	});
};
