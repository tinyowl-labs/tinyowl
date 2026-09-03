import type { LayoutServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export type OrgProject = { slug: string; title: string; role?: string };

export const load: LayoutServerLoad = async ({ locals, params, fetch }) => {
	const { user } = await locals.getSession();
	const accessToken = await locals.getAccessToken();
	const headers: Record<string, string> = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

	const orgRes = await fetch(`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}`, {
		headers,
	});
	if (orgRes.status === 404) {
		error(404, "Organisation not found");
	}
	if (!orgRes.ok) {
		error(502, "Failed to load organisation");
	}
	const org = (await orgRes.json()) as {
		slug: string;
		name: string;
		description?: string | null;
		has_avatar: boolean;
		role?: string;
		projects: OrgProject[];
	};

	return {
		user,
		org,
		canAdmin: org.role === "owner" || org.role === "admin",
		isMember: Boolean(org.role),
	};
};
