import type { Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const actions: Actions = {
    updateLicence: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const licence = String(data.get("licence") ?? "").trim();

        const slug = params.project;
        const accessToken = await locals.getAccessToken();

        const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                licence: licence === "" ? null : licence,
            }),
        });
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true, licenceAction: "updated" };
    },
};
