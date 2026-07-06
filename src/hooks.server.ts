import { createClient } from '$lib/supabase/server';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createClient(event);
	event.locals.getSession = async () => {
		const { data: { user } } = await event.locals.supabase.auth.getUser();
		if (!user) return { session: null, user: null };
		const { data: { session } } = await event.locals.supabase.auth.getSession();
		return { session, user };
	};
	event.locals.getAccessToken = async () => {
		const { data: { session } } = await event.locals.supabase.auth.getSession();
		return session?.access_token ?? null;
	};
	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
