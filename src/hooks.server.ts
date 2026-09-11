import { createClient } from '$lib/supabase/server';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createClient(event);
	let sessionRequest: ReturnType<App.Locals['getSession']> | undefined;
	event.locals.getSession = () => sessionRequest ??= (async () => {
		const { data: { user } } = await event.locals.supabase.auth.getUser();
		if (!user) return { session: null, user: null };
		const { data: { session } } = await event.locals.supabase.auth.getSession();
		return { session, user };
	})();
	event.locals.getAccessToken = async () => {
		const { data: { session } } = await event.locals.supabase.auth.getSession();
		return session?.access_token ?? null;
	};
	return resolve(event, {
        async transformPageChunk({ html }) {
            if (!html.includes('%appearance.preferences%')) return html;
            const { user } = await event.locals.getSession();
            // JSON data only; escape '<' so account metadata cannot close the script tag.
            const appearance = JSON.stringify(user?.user_metadata?.theme_preferences ?? null).replaceAll('<', '\\u003c');
            return html.replace('%appearance.preferences%', () => appearance);
        },
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
