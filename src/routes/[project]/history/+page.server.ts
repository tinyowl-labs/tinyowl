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

	let diffs: any[] = [];
	try {
		const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/diffs`, {
			headers,
		});
		if (res.ok) {
			const data = await res.json();
			diffs = Array.isArray(data) ? data : data.diffs ?? [];
		}
	} catch (_) {}

	let tables: { name: string }[] = [];
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/tables`,
			{ headers },
		);
		if (res.ok) {
			const data = await res.json();
			const tblMap = (data.tables ?? {}) as Record<string, string[]>;
			tables = Object.keys(tblMap).map((name) => ({ name }));
		}
	} catch (_) {}

	let pendingChangesets: any[] = [];
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/changesets?status=pending`,
			{ headers },
		);
		if (res.ok) {
			const data = await res.json();
			pendingChangesets = Array.isArray(data) ? data : [];
		}
	} catch (_) {}

	return {
		accessToken: accessToken ?? "",
		role,
		diffs,
		tables,
		pendingChangesets,
	};
};
