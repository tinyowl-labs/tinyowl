import type { Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const actions: Actions = {
    updateEmbargo: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const embargoUntil = String(data.get("embargo_until") ?? "").trim();
        const embargoNote = String(data.get("embargo_note") ?? "");
        const locationPrecision = String(
            data.get("location_precision") ?? "exact",
        ).trim();

        const slug = params.project;
        const accessToken = await locals.getAccessToken();

        const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                embargo_until: embargoUntil === "" ? "" : embargoUntil,
                embargo_note: embargoNote,
                location_precision: locationPrecision,
            }),
        });
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true, embargoAction: "updated" };
    },
};
