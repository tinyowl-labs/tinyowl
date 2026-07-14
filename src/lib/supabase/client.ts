import { createBrowserClient } from "@supabase/ssr";
import { browser } from "$app/environment";

export function createClient() {
	const isHttps = browser
		? window.location.protocol === "https:"
		: true;
	return createBrowserClient(
		import.meta.env.VITE_SUPABASE_URL!,
		import.meta.env.VITE_SUPABASE_ANON_KEY!,
		{
			cookieOptions: {
				// Plain HTTP (LAN IP / localhost without TLS) cannot use Secure cookies.
				secure: isHttps,
			},
		},
	);
}
