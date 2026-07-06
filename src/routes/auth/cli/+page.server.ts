import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const accessToken = await locals.getAccessToken();
	return { accessToken, serverUrl: 'http://localhost:8080' };
};