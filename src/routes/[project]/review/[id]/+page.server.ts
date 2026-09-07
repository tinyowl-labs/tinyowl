import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { error } from "@sveltejs/kit";
import { projectAuth } from "$lib/server/projectAccess.server";

export const load: PageServerLoad = async ({ locals, params, fetch, parent }) => {
	const slug = params.project;
	const id = params.id;
	const { accessToken, headers, role } = await projectAuth(
		locals,
		parent,
		slug,
		"writer",
	);

	const res = await fetch(
		`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/changesets/${id}/changes`,
		{ headers },
	);
	if (res.status === 404) throw error(404, "Changeset not found");
	if (!res.ok) throw error(res.status, "Failed to load changeset");
	const payload = await res.json();

	return {
		accessToken,
		role,
		changeset: payload.changeset ?? null,
		changes: payload.changes ?? { geodiff: [] },
		summary: payload.summary ?? { geodiff_summary: [] },
	};
};
