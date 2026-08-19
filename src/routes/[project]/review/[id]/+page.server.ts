import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	const slug = params.project;
	const id = params.id;
	const { user } = await locals.getSession();
	if (!user) throw redirect(303, `/${slug}`);

	const accessToken = await locals.getAccessToken();
	const headers: Record<string, string> = {};
	if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

	let role = "viewer";
	if (accessToken) {
		try {
			const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (res.ok) {
				const projects: { slug: string; role: string }[] = await res.json();
				const member = projects.find((p) => p.slug === slug);
				if (member) role = member.role;
			}
		} catch (_) {}
	}
	if (role !== "owner" && role !== "admin" && role !== "collaborator") {
		throw redirect(303, `/${slug}`);
	}

	const res = await fetch(
		`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/changesets/${id}/changes`,
		{ headers },
	);
	if (res.status === 404) throw error(404, "Changeset not found");
	if (!res.ok) throw error(res.status, "Failed to load changeset");
	const payload = await res.json();

	return {
		accessToken: accessToken ?? "",
		role,
		changeset: payload.changeset ?? null,
		changes: payload.changes ?? { geodiff: [] },
		summary: payload.summary ?? { geodiff_summary: [] },
	};
};
