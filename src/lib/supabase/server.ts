import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';

export function createClient(event: RequestEvent) {
	return createServerClient(
		import.meta.env.VITE_SUPABASE_URL!,
		import.meta.env.VITE_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookies) => {
					for (const { name, value, options } of cookies)
						event.cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	);
}
