import type { Actions, PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	const token = await locals.getAccessToken();
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/storage`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (res.ok) return { projectStorage: await res.json() };
	} catch (_) {}
	return { projectStorage: [] };
};

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

	setStorageLimit: async ({ request, locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const data = await request.formData();
		const projectSlug = String(data.get("project_slug") ?? "").trim();
		const rawLimit = String(data.get("limit_gib") ?? "").trim();
		if (!projectSlug) return { error: "Project required." };
		const limitGiB = rawLimit === "" ? null : Number(rawLimit);
		if (limitGiB !== null && (!Number.isFinite(limitGiB) || limitGiB <= 0)) {
			return { error: "Storage limit must be a positive number of GiB." };
		}
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(projectSlug)}/storage-limit`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ limit_gib: limitGiB }),
			},
		);
		if (!res.ok) return { error: `Failed: ${await res.text()}` };
		return { success: true, orgAction: "storage" };
	},
};
