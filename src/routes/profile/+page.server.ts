import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Legacy projects dashboard → unified /users/{id} owner view. */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.getSession();
	if (!user?.id) {
		redirect(303, "/auth/login?next=/profile");
	}
	redirect(303, `/users/${encodeURIComponent(user.id)}`);
};
