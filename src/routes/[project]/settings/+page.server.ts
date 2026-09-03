import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { LEGACY_TAB_TO_PAGE } from "./pages";

export const load: PageServerLoad = ({ url, params }) => {
    const tab = url.searchParams.get("tab") ?? "";
    const dest = LEGACY_TAB_TO_PAGE[tab] ?? "visibility";
    throw redirect(303, `/${params.project}/settings/${dest}`);
};
