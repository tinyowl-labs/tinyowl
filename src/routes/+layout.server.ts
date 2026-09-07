import type { LayoutServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: LayoutServerLoad = async ({ locals, fetch }) => {
	const { user } = await locals.getSession();
	const accessToken = await locals.getAccessToken();
	let inboxUnread = 0;
	if (user && accessToken) {
		try {
			const res = await fetch(
				`${TINYOWL_CORE_URL}/api/v1/notifications?unread=1`,
				{ headers: { Authorization: `Bearer ${accessToken}` } },
			);
			if (res.ok) {
				const body = (await res.json()) as { unread?: number };
				inboxUnread = Number(body.unread) || 0;
			}
		} catch (_) {}
	}
	return { user, accessToken, inboxUnread };
};
