import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import { safeNext } from "$lib/auth-next";

export type InvitePreview = {
	id: string;
	kind: string;
	org_slug?: string;
	project_slug?: string;
	role: string;
	email?: string;
	expired?: boolean;
	revoked_at?: string | null;
	accepted_at?: string | null;
	status?: string;
};

async function apiError(res: Response) {
	const text = await res.text();
	try {
		const body = JSON.parse(text) as { error?: string };
		if (body.error) return body.error;
	} catch (_) {}
	return text || `Failed (${res.status})`;
}

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	const token = url.searchParams.get("token")?.trim() ?? "";
	if (!token) {
		return { missing: true as const, preview: null, signedIn: false };
	}
	const { user } = await locals.getSession();
	const accessToken = await locals.getAccessToken();
	if (user && accessToken) {
		let complete = true;
		try {
			const meRes = await fetch(`${TINYOWL_CORE_URL}/api/v1/me`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (meRes.ok) {
				const me = (await meRes.json()) as { profile_complete?: boolean };
				complete = Boolean(me.profile_complete);
			}
		} catch (_) {}
		if (!complete) {
			throw redirect(
				303,
				`/auth/complete?next=${encodeURIComponent(url.pathname + url.search)}`,
			);
		}
	}
	let preview: InvitePreview | null = null;
	let previewError = "";
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/invites/preview?token=${encodeURIComponent(token)}`,
		);
		if (res.ok) preview = (await res.json()) as InvitePreview;
		else previewError = await apiError(res);
	} catch (_) {
		previewError = "Could not load invite.";
	}
	return {
		missing: false as const,
		token,
		preview,
		previewError,
		signedIn: Boolean(user),
	};
};

export const actions: Actions = {
	redeem: async ({ request, locals, fetch, url }) => {
		const { user } = await locals.getSession();
		const data = await request.formData();
		const token = String(data.get("token") ?? "").trim();
		if (!user) {
			throw redirect(
				303,
				`/auth/login?next=${encodeURIComponent("/auth/invite?token=" + token)}`,
			);
		}
		const accessToken = await locals.getAccessToken();
		const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/invites/redeem`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ token }),
		});
		if (!res.ok) return { error: await apiError(res) };
		const body = (await res.json()) as InvitePreview;
		let href = "/";
		if (body.kind === "org" && body.org_slug) href = `/orgs/${body.org_slug}`;
		else if (body.project_slug) href = `/${encodeURIComponent(body.project_slug)}`;
		throw redirect(303, safeNext(href));
	},
};
