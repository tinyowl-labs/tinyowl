import type { PageServerLoad } from "./$types";
import {
	coreJson,
	jsonArray,
	projectAuth,
} from "$lib/server/projectAccess.server";

export const load: PageServerLoad = async ({ locals, params, fetch, parent }) => {
	const slug = params.project;
	const { accessToken, headers, role } = await projectAuth(
		locals,
		parent,
		slug,
		"writer",
	);

	let preview: Record<string, any> = {
		in_sync: true,
		commits: [],
		changes: { geodiff: [] },
		summary: { geodiff_summary: [] },
		main: "",
		develop: "",
	};
	const promote = await coreJson(
		fetch,
		`/api/v1/projects/${encodeURIComponent(slug)}/promote`,
		headers,
	);
	if (promote && typeof promote === "object") {
		preview = promote as Record<string, any>;
	}

	let changesets = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/changesets?status=pending`,
			headers,
		),
	);
	const requested = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/changesets?status=changes_requested`,
			headers,
		),
	);
	if (requested.length) changesets = [...changesets, ...requested];

	const conflictedCommits = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/commits?status=conflicted`,
			headers,
		),
	);

	let heads: { name: string; commit_id: string; author?: string }[] = [];
	const refs = await coreJson(fetch, `/api/v1/projects/${encodeURIComponent(slug)}/refs`, headers);
	if (refs && typeof refs === "object") {
		const develop = typeof (refs as any).develop === "string" ? (refs as any).develop : "";
		if (Array.isArray((refs as any).heads)) {
			heads = (refs as any).heads.filter(
				(h: { commit_id?: string }) =>
					h?.commit_id && h.commit_id !== develop,
			);
		}
	}

	return {
		accessToken,
		preview,
		changesets,
		conflictedCommits,
		heads,
		role,
	};
};
