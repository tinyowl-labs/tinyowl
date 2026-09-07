import type { Actions, PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

type OrgMember = { user_id: string; email: string; role: string };
type JoinRequest = {
	id: string;
	requester_id: string;
	requester_name?: string;
	requester_email?: string;
	status: string;
	created_at?: string;
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
	const token = await locals.getAccessToken();
	let members: OrgMember[] = [];
	let joinRequests: JoinRequest[] = [];
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/members`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (res.ok) members = await res.json();
	} catch (_) {}
	try {
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/join-requests`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (res.ok) joinRequests = await res.json();
	} catch (_) {}
	const { user } = await locals.getSession();
	return { members, joinRequests, currentUserId: user?.id ?? "" };
};

export const actions: Actions = {
	addMember: async ({ request, locals, params, fetch }) => {
		const { user } = await locals.getSession();
		if (!user) return { error: "Not signed in" };
		const data = await request.formData();
		const email = String(data.get("email") ?? "").trim();
		const role = String(data.get("role") ?? "member").trim();
		if (!email) return { error: "Email is required." };
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/members`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
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
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/members/${userId}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
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
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/members/${userId}`,
			{
				method: "DELETE",
				headers: { Authorization: `Bearer ${token}` },
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
		const role = String(data.get("role") ?? "member").trim();
		if (!id) return { error: "Request id required." };
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/join-requests/${id}/accept`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
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
		const token = await locals.getAccessToken();
		const res = await fetch(
			`${TINYOWL_CORE_URL}/api/v1/orgs/${params.org}/join-requests/${id}/decline`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			},
		);
		if (!res.ok) return { error: await apiError(res) };
		return { success: true, memberAction: "declined" };
	},
};
