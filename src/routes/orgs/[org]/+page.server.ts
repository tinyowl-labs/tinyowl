import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	createProject: async ({ request, locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const data = await request.formData();
		const name = String(data.get("name") ?? "").trim();
		if (!name) return { error: "Project name is required." };
		const slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/projects`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ slug, title: name }),
			},
		);
		if (!res.ok) return { error: `Failed: ${await res.text()}` };
		const created = await res.json();
		throw redirect(303, `/${created.slug}`);
	},
};
