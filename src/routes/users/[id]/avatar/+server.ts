import { TINYOWL_CORE_URL } from "$env/static/private";
import { generatedAvatarSvg } from "$lib/user-avatar";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
	const token = await locals.getAccessToken();
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(
		`${TINYOWL_CORE_URL}/api/v1/users/${encodeURIComponent(params.id)}/avatar`,
		{ headers },
	);
	if (res.ok) {
		const buf = await res.arrayBuffer();
		return new Response(buf, {
			headers: {
				"Content-Type": res.headers.get("Content-Type") ?? "image/png",
				"Cache-Control": "public, max-age=60",
			},
		});
	}
	const svg = generatedAvatarSvg(params.id);
	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml; charset=utf-8",
			"Cache-Control": "public, max-age=60",
		},
	});
};
