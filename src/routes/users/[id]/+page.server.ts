import { error } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";
import type { PageServerLoad } from "./$types";

export type UserOrg = {
	slug: string;
	name: string;
	has_avatar: boolean;
	role?: string;
};

export type UserProject = {
	slug: string;
	title: string;
	visibility?: string;
	role?: string;
	org_slug?: string;
};

export type ProfileDiff = {
	id: number;
	project_slug: string;
	project_title: string;
	seq: number;
	sha256: string;
	parent_sha: string | null;
	entity_count: number;
	byte_size: number;
	created_at: string;
};

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	const accessToken = await locals.getAccessToken();
	const headers: Record<string, string> = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

	const res = await fetch(
		`${TINYOWL_CORE_URL}/api/v1/users/${encodeURIComponent(params.id)}`,
		{ headers },
	);
	if (res.status === 404) {
		error(404, "User not found");
	}
	if (!res.ok) {
		error(502, "Failed to load user");
	}
	const profile = (await res.json()) as {
		id: string;
		display_name: string;
		username?: string;
		first_name?: string;
		last_name?: string;
		dotted_name?: string;
		email?: string;
		has_avatar: boolean;
		orgs: UserOrg[];
		projects: UserProject[];
	};
	const { user } = await locals.getSession();
	const isSelf = Boolean(user?.id && user.id === profile.id);

	let projects: UserProject[] = profile.projects ?? [];
	let diffs: ProfileDiff[] = [];
	let orgs: UserOrg[] = profile.orgs ?? [];

	if (isSelf && accessToken) {
		try {
			const projRes = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (projRes.ok) {
				projects = await projRes.json();
			}
		} catch (_) {}

		try {
			const diffRes = await fetch(
				`${TINYOWL_CORE_URL}/api/v1/profile/diffs?limit=30`,
				{ headers: { Authorization: `Bearer ${accessToken}` } },
			);
			if (diffRes.ok) diffs = await diffRes.json();
		} catch (_) {}

		try {
			const orgRes = await fetch(`${TINYOWL_CORE_URL}/api/v1/orgs`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (orgRes.ok) orgs = await orgRes.json();
		} catch (_) {}
	}

	return {
		profile,
		isSelf,
		projects,
		diffs,
		orgs,
	};
};
