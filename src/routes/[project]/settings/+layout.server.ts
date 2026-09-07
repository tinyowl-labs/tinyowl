import type { LayoutServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: LayoutServerLoad = async ({ parent, params, url }) => {
    const { user, role } = await parent();
    const page = url.pathname.split("/").pop();
    const fieldPage =
        page === "qfieldcloud" &&
        (role === "owner" || role === "admin" || role === "collaborator");
    if (
        !user ||
        (role !== "owner" && role !== "admin" && !fieldPage)
    ) {
        throw redirect(303, `/${params.project}`);
    }
    return {};
};
