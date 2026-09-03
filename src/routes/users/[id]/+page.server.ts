import { error } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";
import type { PageServerLoad } from "./$types";

export type UserOrg = {
	slug: string;
	name: string;
	has_avatar: boolean;
	role?: string;
};

export type UserProject = { slug: string; title: string };

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
		email?: string;
		has_avatar: boolean;
		orgs: UserOrg[];
		projects: UserProject[];
	};
	const { user } = await locals.getSession();
	return {
		profile,
		isSelf: Boolean(user?.id && user.id === profile.id),
	};
};
