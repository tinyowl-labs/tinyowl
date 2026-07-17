import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
    const { user } = await locals.getSession();
    if (!user) throw redirect(303, "/auth/login?next=/digitize");
    const accessToken = await locals.getAccessToken();
    if (!accessToken) throw redirect(303, "/auth/login?next=/digitize");
    return { accessToken };
};
