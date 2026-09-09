import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type Member = {
    user_id: string;
    email: string;
    role: string;
    display_name?: string;
    username?: string;
};
type JoinRequest = {
    id: string;
    requester_id: string;
    requester_name?: string;
    requester_email?: string;
    status: string;
    created_at?: string;
};
type Invite = {
    id: string;
    role: string;
    email?: string | null;
    expired?: boolean;
    expires_at?: string;
};

async function apiError(res: Response) {
    const text = await res.text();
    try {
        const body = JSON.parse(text) as { error?: string };
        if (body.error) return body.error;
    } catch (_) {}
    return text || `Failed (${res.status})`;
}

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
    const accessToken = await locals.getAccessToken();
    let members: Member[] = [];
    let joinRequests: JoinRequest[] = [];
    let invites: Invite[] = [];
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/members`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) members = await res.json();
    } catch (_) {}
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/join-requests`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) joinRequests = await res.json();
    } catch (_) {}
    try {
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/invites`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) invites = await res.json();
    } catch (_) {}
    return {
        members,
        joinRequests,
        invites,
        currentUserId: (await locals.getSession()).user?.id ?? "",
        accessToken,
    };
};

export const actions: Actions = {
    createInvite: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const email = String(data.get("email") ?? "").trim();
        const userId = String(data.get("user_id") ?? "").trim();
        const role = String(data.get("role") ?? "viewer").trim();
        if (!email && !userId) {
            return { error: "Pick a person or enter an email." };
        }

        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/invites`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ email, role, user_id: userId || undefined }),
            },
        );
        if (!res.ok) return { error: await apiError(res) };
        const body = (await res.json()) as {
            status?: string;
            url?: string;
        };
        if (body.status === "added") {
            return { success: true, memberAction: "added" };
        }
        return {
            success: true,
            memberAction: "invited",
            inviteUrl: body.url ?? "",
        };
    },

    revokeInvite: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };
        const data = await request.formData();
        const id = String(data.get("id") ?? "").trim();
        if (!id) return { error: "Invite id required." };
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${params.project}/invites/${id}`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        if (!res.ok) return { error: await apiError(res) };
        return { success: true, memberAction: "revoked" };
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

    acceptJoin: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };
        const data = await request.formData();
        const id = String(data.get("id") ?? "").trim();
        const role = String(data.get("role") ?? "collaborator").trim();
        if (!id) return { error: "Request id required." };
        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/join-requests/${id}/accept`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ role }),
            },
        );
        if (!res.ok) return { error: await apiError(res) };
        return { success: true, memberAction: "accepted" };
    },

    declineJoin: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };
        const data = await request.formData();
        const id = String(data.get("id") ?? "").trim();
        if (!id) return { error: "Request id required." };
        const slug = params.project;
        const accessToken = await locals.getAccessToken();
        const res = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/join-requests/${id}/decline`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
            },
        );
        if (!res.ok) return { error: await apiError(res) };
        return { success: true, memberAction: "declined" };
    },
};
