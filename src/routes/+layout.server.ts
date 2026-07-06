import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user } = await locals.getSession();
	const accessToken = await locals.getAccessToken();
	return { user, accessToken };
};
