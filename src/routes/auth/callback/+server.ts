import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { safeNext } from "$lib/auth-next";

export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get("code");
	const next = safeNext(url.searchParams.get("next"));
	if (code) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (error) {
			throw redirect(
				303,
				`/auth/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`,
			);
		}
	}
	throw redirect(303, next);
};
