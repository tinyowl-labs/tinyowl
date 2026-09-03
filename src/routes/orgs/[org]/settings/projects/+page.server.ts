import type { Actions, PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
	attachProject: async ({ request, locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const data = await request.formData();
		const projectSlug = String(data.get("project_slug") ?? "").trim();
		if (!projectSlug) return { error: "Project slug required." };
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/projects`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ project_slug: projectSlug }),
			},
		);
		if (!res.ok) return { error: `Failed: ${await res.text()}` };
		return { success: true, orgAction: "attached" };
	},
};
