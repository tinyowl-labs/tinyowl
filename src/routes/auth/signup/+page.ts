import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
	if (env.PUBLIC_DEMO_INVITE_ONLY === "true") {
		throw redirect(303, "/auth/login");
	}
};
