import type { PageServerLoad, Actions } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export type InboxJoinRequest = {
	id: string;
	kind: string;
	org_slug?: string;
	project_slug?: string;
	requester_id: string;
	requester_name?: string;
	status: string;
};

export type InboxNotification = {
	id: string;
	kind: string;
	title: string;
	read_at?: string | null;
	created_at: string;
	join_request?: InboxJoinRequest | null;
	invite?: {
		kind: string;
		org_slug?: string;
		project_slug?: string;
	} | null;
};

function safeHref(raw: string): string | null {
	if (!raw.startsWith("/") || raw.startsWith("//")) return null;
	return raw;
}

export const load: PageServerLoad = async ({ locals, fetch }) => {
	const { user } = await locals.getSession();
	if (!user) throw redirect(303, "/auth/login?next=/inbox");

	const token = await locals.getAccessToken();
	let items: InboxNotification[] = [];
	let unread = 0;
	if (token) {
		try {
			const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/notifications`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (res.ok) {
				const body = (await res.json()) as {
					unread?: number;
					items?: InboxNotification[];
				};
				unread = Number(body.unread) || 0;
				items = body.items ?? [];
			}
		} catch (_) {}
	}
	return { items, unread };
};

export const actions: Actions = {
	open: async ({ request, locals, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) throw redirect(303, "/auth/login?next=/inbox");
		const data = await request.formData();
		const id = String(data.get("id") ?? "").trim();
		const href = safeHref(String(data.get("href") ?? "").trim()) ?? "/inbox";
		const token = await locals.getAccessToken();
		if (id && token) {
			await fetch(`${TINYOWL_CORE_URL}/api/v1/notifications/${id}/read`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
		}
		throw redirect(303, href);
	},

	readAll: async ({ locals, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) throw redirect(303, "/auth/login?next=/inbox");
		const token = await locals.getAccessToken();
		if (token) {
			await fetch(`${TINYOWL_CORE_URL}/api/v1/notifications/read-all`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
		}
		return { success: true };
	},
};
