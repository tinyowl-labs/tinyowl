import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
    const accessToken = await locals.getAccessToken();
    const slug = params.project;

    let qfieldLink: {
        tinyowl_slug: string;
        account_id: string;
        qfc_project_id: string;
        qfc_project_name?: string;
        base_url?: string;
        username?: string;
        linked_at?: string;
        last_job_id?: string;
        last_synced_at?: string;
    } | null = null;
    let qfieldAccounts: {
        id: string;
        base_url: string;
        username: string;
        label?: string | null;
    }[] = [];
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
            const data = await res.json();
            qfieldLink = data ?? null;
        }
    } catch (_) {}
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) qfieldAccounts = await res.json();
    } catch (_) {}

    return { qfieldLink, qfieldAccounts };
};

export const actions: Actions = {
    linkQFieldCloud: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in", qfieldAction: "link" };

        const data = await request.formData();
        const accountId = String(data.get("account_id") ?? "").trim();
        const qfcProjectId = String(data.get("qfc_project_id") ?? "").trim();
        const qfcProjectName = String(data.get("qfc_project_name") ?? "").trim();
        const gpkgName = String(data.get("gpkg_name") ?? "").trim();
        if (!accountId || !qfcProjectId) {
            return {
                error: "Account and Cloud project required.",
                qfieldAction: "link",
            };
        }

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    account_id: accountId,
                    qfc_project_id: qfcProjectId,
                    qfc_project_name: qfcProjectName || undefined,
                    gpkg_name: gpkgName || undefined,
                }),
            },
        );
        if (!res.ok) {
            return { error: `Failed: ${await res.text()}`, qfieldAction: "link" };
        }
        return { success: true, qfieldAction: "linked" };
    },

    unlinkQFieldCloud: async ({ locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in", qfieldAction: "unlink" };

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        if (!res.ok) {
            return {
                error: `Failed: ${await res.text()}`,
                qfieldAction: "unlink",
            };
        }
        return { success: true, qfieldAction: "unlinked" };
    },

    syncQFieldCloud: async ({ locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in", qfieldAction: "sync" };

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/qfieldcloud-link/sync`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        if (!res.ok) {
            return { error: `Failed: ${await res.text()}`, qfieldAction: "sync" };
        }
        return { success: true, qfieldAction: "sync_requested" };
    },
};
