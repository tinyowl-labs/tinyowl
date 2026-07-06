import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	const { user } = await locals.getSession();
	if (!user) return { user: null, projects: [] };

	const accessToken = await locals.getAccessToken();
	const serverUrl = 'http://localhost:8080';

	let projects: { slug: string; title: string; role: string }[] = [];
	try {
		const res = await fetch(`${serverUrl}/api/v1/projects`, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		if (res.ok) projects = await res.json();
	} catch (_) {}

	return { user, projects };
};

export const actions: Actions = {
	create: async ({ request, locals, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: 'Not signed in' };

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return { error: 'Project name is required.' };

		const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const accessToken = await locals.getAccessToken();

		const res = await fetch('http://localhost:8080/api/v1/projects', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify({ slug, title: name, description: '' })
		});

		if (!res.ok) {
			const err = await res.text();
			return { error: `Failed: ${err}` };
		}

		return { success: true, slug };
	}
};
