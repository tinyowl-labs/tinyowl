import type { LayoutServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: LayoutServerLoad = async ({ parent, params }) => {
	const { canAdmin } = await parent();
	if (!canAdmin) {
		throw redirect(303, `/orgs/${params.org}`);
	}
	return {};
};
