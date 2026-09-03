import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type Member = { user_id: string; email: string; role: string };

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
    const accessToken = await locals.getAccessToken();
    let members: Member[] = [];
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/members`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) members = await res.json();
    } catch (_) {}
    return { members, currentUserId: (await locals.getSession()).user?.id ?? "" };
};

export const actions: Actions = {
    addMember: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const email = String(data.get("email") ?? "").trim();
        const role = String(data.get("role") ?? "viewer").trim();
        if (!email) return { error: "Email is required." };

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ email, role }),
            },
        );
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true, memberAction: "added" };
    },

    updateRole: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const userId = String(data.get("userId") ?? "").trim();
        const role = String(data.get("role") ?? "").trim();
        if (!userId || !role) return { error: "User and role required." };

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members/${userId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ role }),
            },
        );
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true, memberAction: "updated" };
    },

    removeMember: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const userId = String(data.get("userId") ?? "").trim();
        if (!userId) return { error: "User ID required." };

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/members/${userId}`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true, memberAction: "removed" };
    },
};
