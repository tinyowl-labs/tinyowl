import type { PageServerLoad } from "./$types";
import { projectAuth } from "$lib/server/projectAccess.server";

export const load: PageServerLoad = async ({ locals, params, parent }) => {
    const slug = params.project;
    const { accessToken, role, layout } = await projectAuth(
        locals,
        parent,
        slug,
        "writer",
    );

    return {
        accessToken,
        role,
        title: layout.project?.title ?? slug,
    };
};
