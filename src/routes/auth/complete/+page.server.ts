import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { safeNext } from "$lib/auth-next";

export type MeProfile = {
	username?: string;
	first_name?: string;
	last_name?: string;
	profile_complete?: boolean;
};

function metaStr(user: { user_metadata?: Record<string, unknown> } | null, keys: string[]): string {
	const meta = user?.user_metadata ?? {};
	for (const k of keys) {
		const v = meta[k];
		if (typeof v === "string" && v.trim()) return v.trim();
	}
	return "";
}

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	const { user } = await locals.getSession();
	const next = safeNext(url.searchParams.get("next"));
	if (!user) {
		throw redirect(303, `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
	const token = await locals.getAccessToken();
	let me: MeProfile = {};
	if (token) {
		try {
			const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/me`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			if (res.ok) me = (await res.json()) as MeProfile;
		} catch (_) {}
	}
	if (me.profile_complete) {
		throw redirect(303, next);
	}
	const github = metaStr(user, ["user_name", "preferred_username"]);
	return {
		next,
		username: me.username || github.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
		firstName:
			me.first_name ||
			metaStr(user, ["first_name", "given_name"]),
		lastName:
			me.last_name ||
			metaStr(user, ["last_name", "family_name"]),
	};
};
