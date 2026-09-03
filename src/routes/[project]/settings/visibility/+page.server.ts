import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
    const accessToken = await locals.getAccessToken();
    let tables: Record<string, string[]> = {};
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/tables`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
            const data = await res.json();
            tables = data.tables ?? {};
        }
    } catch (_) {}
    return { tables };
};

export const actions: Actions = {
    updateVisibility: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const visibility = String(data.get("visibility") ?? "").trim();
        const tableName = String(data.get("table_name") ?? "").trim();

        const slug = params.project;
        const accessToken = await locals.getAccessToken();

        const body: Record<string, unknown> = {};
        if (tableName) {
            body.table_visibility = { [tableName]: visibility };
        } else {
            body.visibility = visibility;
        }

        const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true, visibilityAction: "updated" };
    },
};
