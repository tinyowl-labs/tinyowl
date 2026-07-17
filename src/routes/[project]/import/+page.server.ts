import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, parent }) => {
    const { user } = await locals.getSession();
    const slug = params.project;
    if (!user) throw redirect(303, `/${slug}`);

    const accessToken = await locals.getAccessToken();
    let role = "viewer";
    try {
        const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
            const projects: { slug: string; role: string }[] = await res.json();
            const mine = projects.find((p) => p.slug === slug);
            if (mine) role = mine.role;
        }
    } catch {
        /* ignore */
    }

    const canWrite = ["owner", "admin", "collaborator"].includes(role);
    if (!canWrite) throw redirect(303, `/${slug}`);

    const parentData = await parent();
    return {
        accessToken,
        role,
        title: (parentData as { project?: { title?: string } })?.project?.title ?? slug,
    };
};
