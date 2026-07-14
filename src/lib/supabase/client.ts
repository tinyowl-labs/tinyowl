import { createBrowserClient } from "@supabase/ssr";
import { browser } from "$app/environment";

/** Fixed cookie name so browser (Funnel origin) and SSR (127.0.0.1) share the session. */
const AUTH_COOKIE = "sb-tinyowl-auth-token";

/** Browser URL for Supabase. Same-origin mode proxies via the demo front door. */
function browserSupabaseUrl(): string {
	const sameOrigin =
		import.meta.env.VITE_SUPABASE_SAME_ORIGIN === "true" ||
		import.meta.env.PUBLIC_DEMO_INVITE_ONLY === "true";
	if (sameOrigin && browser) {
		return window.location.origin;
	}
	return import.meta.env.VITE_SUPABASE_URL!;
}

export function createClient() {
	const isHttps = browser
		? window.location.protocol === "https:"
		: true;
	return createBrowserClient(
		browserSupabaseUrl(),
		import.meta.env.VITE_SUPABASE_ANON_KEY!,
		{
			cookieOptions: {
				name: AUTH_COOKIE,
				// Plain HTTP (LAN IP / localhost without TLS) cannot use Secure cookies.
				secure: isHttps,
				path: "/",
				sameSite: "lax",
			},
		},
	);
}
