import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	const slug = params.project;
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

	let preview: Record<string, any> = {
		in_sync: true,
		commits: [],
		changes: { geodiff: [] },
		summary: { geodiff_summary: [] },
		main: "",
		develop: "",
	};
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/promote`,
			{ headers },
		);
		if (res.ok) {
			preview = await res.json();
		}
	} catch (_) {}

	let changesets: any[] = [];
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/changesets?status=pending`,
			{ headers },
		);
		if (res.ok) {
			const data = await res.json();
			changesets = Array.isArray(data) ? data : [];
		}
		const res2 = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/changesets?status=changes_requested`,
			{ headers },
		);
		if (res2.ok) {
			const data = await res2.json();
			if (Array.isArray(data)) changesets = [...changesets, ...data];
		}
	} catch (_) {}

	let conflictedCommits: any[] = [];
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/commits?status=conflicted`,
			{ headers },
		);
		if (res.ok) {
			const data = await res.json();
			conflictedCommits = Array.isArray(data) ? data : [];
		}
	} catch (_) {}

	return {
		accessToken: accessToken ?? "",
		preview,
		changesets,
		conflictedCommits,
		role,
	};
};
