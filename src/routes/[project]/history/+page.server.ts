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
		"member",
	);

	const diffs = jsonArray(
		await coreJson(fetch, `/api/v1/projects/${encodeURIComponent(slug)}/diffs`, headers),
		"diffs",
	);

	let tables: { name: string }[] = [];
	const tablesPayload = await coreJson(
		fetch,
		`/api/v1/projects/${encodeURIComponent(slug)}/tables`,
		headers,
	);
	if (tablesPayload && typeof tablesPayload === "object") {
		const tblMap = ((tablesPayload as any).tables ?? {}) as Record<
			string,
			string[]
		>;
		tables = Object.keys(tblMap).map((name) => ({ name }));
	}

	const pendingChangesets = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/changesets?status=pending`,
			headers,
		),
	);
	const commits = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/commits?ref=develop`,
			headers,
		),
	);
	const mainCommits = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/commits?ref=main`,
			headers,
		),
	);
	const conflictedCommits = jsonArray(
		await coreJson(
			fetch,
			`/api/v1/projects/${encodeURIComponent(slug)}/commits?status=conflicted`,
			headers,
		),
	);

	return {
		accessToken,
		role,
		diffs,
		tables,
		pendingChangesets,
		commits,
		mainCommits,
		conflictedCommits,
	};
};
