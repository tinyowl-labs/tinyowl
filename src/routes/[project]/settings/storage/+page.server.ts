import type { Actions, PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export type ProjectStorage = {
    project_slug: string;
    org_slug?: string;
    used_bytes: number;
    limit_bytes?: number | null;
    available_bytes?: number | null;
    can_set_limit?: boolean;
};

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
    const token = await locals.getAccessToken();
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/storage`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) return { storage: (await res.json()) as ProjectStorage };
    } catch (_) {}
    return { storage: null as ProjectStorage | null };
};

export const actions: Actions = {
    setStorageLimit: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };
        const data = await request.formData();
        const rawLimit = String(data.get("limit_gib") ?? "").trim();
        const limitGiB = rawLimit === "" ? null : Number(rawLimit);
        if (limitGiB !== null && (!Number.isFinite(limitGiB) || limitGiB <= 0)) {
            return { error: "Storage limit must be a positive number of GiB." };
        }
        const token = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/storage-limit`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ limit_gib: limitGiB }),
            },
        );
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true };
    },
};
