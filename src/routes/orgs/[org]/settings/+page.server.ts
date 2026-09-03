import type { Actions, PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async () => ({});

async function core(
	fetch: typeof globalThis.fetch,
	token: string | null,
	path: string,
	init?: RequestInit,
) {
	return fetch(`${TINYOWL_CORE_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			...(init?.headers ?? {}),
		},
	});
}

export const actions: Actions = {
	update: async ({ request, locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const data = await request.formData();
		const name = String(data.get("name") ?? "").trim();
		const description = String(data.get("description") ?? "");
		const token = await locals.getAccessToken();
		const res = await core(fetch, token, `/api/v1/orgs/${params.org}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, description }),
		});
		if (!res.ok) return { error: `Failed: ${await res.text()}` };
		return { success: true, orgAction: "updated" };
	},

	uploadAvatar: async ({ request, locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const data = await request.formData();
		const file = data.get("avatar");
		if (!(file instanceof File) || file.size === 0) {
			return { error: "Choose an image." };
		}
		const buf = Buffer.from(await file.arrayBuffer());
		const token = await locals.getAccessToken();
		const res = await core(fetch, token, `/api/v1/orgs/${params.org}/avatar`, {
			method: "PUT",
			headers: {
				"Content-Type": file.type || "application/octet-stream",
			},
			body: buf,
		});
		if (!res.ok) return { error: `Avatar: ${await res.text()}` };
		return { success: true, orgAction: "avatar" };
	},

	removeAvatar: async ({ locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const token = await locals.getAccessToken();
		const res = await core(fetch, token, `/api/v1/orgs/${params.org}/avatar`, {
			method: "DELETE",
		});
		if (!res.ok) return { error: `Failed: ${await res.text()}` };
		return { success: true, orgAction: "avatar-removed" };
	},
};
