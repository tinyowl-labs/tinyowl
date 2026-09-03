import type { LayoutServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: LayoutServerLoad = async ({ parent, params }) => {
    const { user, role } = await parent();
    if (!user || (role !== "owner" && role !== "admin")) {
        throw redirect(303, `/${params.project}`);
    }
    return {};
};
