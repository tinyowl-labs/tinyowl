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
    let developCommit = "";
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
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/refs`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
            const refs = await res.json();
            developCommit = String(refs?.develop ?? "");
        }
    } catch (_) {}

    return { qfieldLink, qfieldAccounts, accessToken, developCommit };
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

    pushFieldPackage: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) {
            return { error: "Not signed in", qfieldAction: "field_push" };
        }
        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const incoming = await request.formData();
        const message = String(incoming.get("message") ?? "").trim();
        const baseCommit = String(incoming.get("base_commit") ?? "").trim();
        const file = incoming.get("gpkg");
        if (!message) {
            return {
                error: "Commit message required.",
                qfieldAction: "field_push",
            };
        }
        if (!baseCommit) {
            return {
                error: "base_commit required (from tinyowl.json in the package).",
                qfieldAction: "field_push",
            };
        }
        if (!(file instanceof File) || file.size === 0) {
            return {
                error: "Upload the edited project.gpkg or the field zip.",
                qfieldAction: "field_push",
            };
        }
        const body = new FormData();
        body.set("gpkg", file, file.name);
        body.set("message", message);
        body.set("base_commit", baseCommit);
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/field-package/push`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "X-TinyOwl-Message": message,
                    "X-TinyOwl-Base-Commit": baseCommit,
                    "X-TinyOwl-Target-Ref": "develop",
                },
                body,
            },
        );
        if (!res.ok) {
            return {
                error: `Failed: ${await res.text()}`,
                qfieldAction: "field_push",
            };
        }
        let develop = "";
        try {
            const out = await res.json();
            develop = String(out?.develop ?? "");
        } catch (_) {}
        return {
            success: true,
            qfieldAction: "field_pushed",
            develop,
        };
    },
};
