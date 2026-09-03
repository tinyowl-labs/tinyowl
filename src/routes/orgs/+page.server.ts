import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export type OrgListItem = {
	slug: string;
	name: string;
	description?: string | null;
	has_avatar: boolean;
	role: string;
};

export const load: PageServerLoad = async ({ locals, fetch }) => {
	const { user } = await locals.getSession();
	if (!user) throw redirect(303, "/auth/login");

	const accessToken = await locals.getAccessToken();
	let orgs: OrgListItem[] = [];
	if (accessToken) {
		try {
			const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/orgs`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (res.ok) orgs = await res.json();
		} catch (_) {}
	}
	return { user, orgs };
};

export const actions: Actions = {
	create: async ({ request, locals, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };

		const data = await request.formData();
		const name = String(data.get("name") ?? "").trim();
		let slug = String(data.get("slug") ?? "").trim().toLowerCase();
		if (!name) return { error: "Name is required." };
		if (!slug) {
			slug = name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
		}
		const accessToken = await locals.getAccessToken();
		const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/orgs`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ slug, name }),
		});
		if (!res.ok) {
			return { error: `Failed: ${await res.text()}` };
		}
		const created = await res.json();
		throw redirect(303, `/orgs/${created.slug}`);
	},
};
