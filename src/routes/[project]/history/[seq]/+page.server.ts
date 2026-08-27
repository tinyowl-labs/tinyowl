import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	const slug = params.project;
	const seq = Number(params.seq);
	const { user } = await locals.getSession();
	if (!user) throw redirect(303, `/${slug}`);
	if (!Number.isInteger(seq) || seq < 1) throw error(400, "invalid seq");

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
		`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/diffs/${seq}/changes`,
		{ headers },
	);
	if (res.status === 404) throw error(404, "Diff not found");
	if (!res.ok) throw error(res.status, "Failed to load diff");
	const payload = await res.json();

	return {
		accessToken: accessToken ?? "",
		role,
		seq,
		diff: payload.diff ?? { seq },
		changes: payload.changes ?? { geodiff: [] },
		summary: payload.summary ?? { geodiff_summary: [] },
	};
};
