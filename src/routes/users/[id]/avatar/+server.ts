import { TINYOWL_CORE_URL } from "$env/static/private";
import { generatedAvatarSvg } from "$lib/user-avatar";
import type { AvatarStyle } from "$lib/avatar-style";
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

	let style: AvatarStyle | null = null;
	try {
		const metaRes = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/users/${encodeURIComponent(params.id)}/avatar-meta`,
			{ headers },
		);
		if (metaRes.ok) {
			const meta = (await metaRes.json()) as { avatar_style?: AvatarStyle | null };
			style = meta.avatar_style ?? null;
		}
	} catch (_) {}

	const svg = generatedAvatarSvg(params.id, style);
	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml; charset=utf-8",
			"Cache-Control": "public, max-age=0, must-revalidate",
		},
	});
};
