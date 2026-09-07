import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { error, redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	const slug = params.project;
	const rev = String(params.seq ?? "").trim();
	const { user } = await locals.getSession();
	if (!user) throw redirect(303, `/${slug}`);

	const accessToken = await locals.getAccessToken();
	const headers: Record<string, string> = {};
	if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

	let role = "none";
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
	if (role === "none") {
		throw redirect(303, `/${slug}`);
	}

	const isCommit = /^[0-9a-f]{32,}$/i.test(rev);
	const seq = Number(rev);
	if (!isCommit && (!Number.isInteger(seq) || seq < 1)) {
		throw error(400, "invalid revision");
	}

	const url = isCommit
		? `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/commits/${rev}/changes`
		: `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/diffs/${seq}/changes`;
	const res = await fetch(url, { headers });
	if (res.status === 404) throw error(404, "Revision not found");
	if (!res.ok) throw error(res.status, "Failed to load revision");
	const payload = await res.json();

	let commit = payload.commit ?? null;
	if (!isCommit && Number.isInteger(seq) && seq >= 1) {
		try {
			const cres = await fetch(
				`${TINYOWL_CORE_URL}/api/v1/projects/${slug}/commits?ref=main`,
				{ headers },
			);
			if (cres.ok) {
				const list = await cres.json();
				if (Array.isArray(list) && list.length >= seq) {
					commit = list[list.length - seq] ?? commit;
				}
			}
		} catch (_) {}
	}

	return {
		accessToken: accessToken ?? "",
		role,
		rev,
		seq: isCommit ? 0 : seq,
		commit,
		diff: payload.diff ?? payload.commit ?? { seq: isCommit ? undefined : seq },
		changes: payload.changes ?? { geodiff: [] },
		summary: payload.summary ?? { geodiff_summary: [] },
	};
};
