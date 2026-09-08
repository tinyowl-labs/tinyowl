import { createClient } from "$lib/supabase/client";
import { safeNext } from "$lib/auth-next";

/** Start Google/GitHub OAuth; returns an error message or null if the redirect began. */
export async function startOAuth(
	provider: "google" | "github",
	nextRaw: string | null | undefined,
): Promise<string | null> {
	const supabase = createClient();
	const next = safeNext(nextRaw);
	const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
	const { error } = await supabase.auth.signInWithOAuth({
		provider,
		options: { redirectTo },
	});
	return error?.message ?? null;
}
