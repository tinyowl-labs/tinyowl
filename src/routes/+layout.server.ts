import type { LayoutServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: LayoutServerLoad = async ({ locals, fetch, url }) => {
	const { user } = await locals.getSession();
	const accessToken = await locals.getAccessToken();
	let inboxUnread = 0;
	let profileComplete = true;
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
		try {
			const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/me`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (res.ok) {
				const me = (await res.json()) as { profile_complete?: boolean };
				profileComplete = Boolean(me.profile_complete);
			}
		} catch (_) {}
	}
	if (
		user &&
		!profileComplete &&
		!url.pathname.startsWith("/auth/")
	) {
		throw redirect(
			303,
			`/auth/complete?next=${encodeURIComponent(url.pathname + url.search)}`,
		);
	}
	return { user, accessToken, inboxUnread, profileComplete };
};
