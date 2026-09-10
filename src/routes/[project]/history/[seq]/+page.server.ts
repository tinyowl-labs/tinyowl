import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { error } from "@sveltejs/kit";
import {
	coreJson,
	jsonArray,
	projectAuth,
} from "$lib/server/projectAccess.server";

export const load: PageServerLoad = async ({ locals, params, fetch, parent }) => {
	const slug = params.project;
	const rev = String(params.seq ?? "").trim();
	const { accessToken, headers, role } = await projectAuth(
		locals,
		parent,
		slug,
		"member",
	);

	const isCommit = /^[0-9a-f]{32,}$/i.test(rev);
	const seq = Number(rev);
	if (!isCommit && (!Number.isInteger(seq) || seq < 1)) {
		throw error(400, "invalid revision");
	}

	const url = isCommit
		? `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/commits/${rev}/changes`
		: `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/diffs/${seq}/changes`;
	const res = await fetch(url, { headers });
	if (res.status === 404) throw error(404, "Revision not found");
	if (!res.ok) throw error(res.status, "Failed to load revision");
	const payload = await res.json();

	let commit = payload.commit ?? null;
	if (!isCommit && Number.isInteger(seq) && seq >= 1) {
		const list = jsonArray(
			await coreJson(
				fetch,
				`/api/v1/projects/${encodeURIComponent(slug)}/commits?ref=main`,
				headers,
			),
		);
		if (list.length >= seq) {
			commit = list[list.length - seq] ?? commit;
		}
	}

	return {
		accessToken,
		role,
		rev,
		seq: isCommit ? 0 : seq,
		commit,
		diff: payload.diff ?? payload.commit ?? { seq: isCommit ? undefined : seq },
		changes: payload.changes ?? { geodiff: [] },
		summary: payload.summary ?? { geodiff_summary: [] },
	};
};
