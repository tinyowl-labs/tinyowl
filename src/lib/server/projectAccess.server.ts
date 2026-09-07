import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

type ProjectLayout = {
	user?: unknown;
	role?: string;
	isMember?: boolean;
	project?: { title?: string };
};

export async function projectAuth(
	locals: App.Locals,
	parent: () => Promise<ProjectLayout>,
	slug: string,
	mode: "member" | "writer",
) {
	const layout = await parent();
	const role = layout.role ?? "viewer";
	if (!layout.user) throw redirect(303, `/${slug}`);
	if (mode === "member" && !layout.isMember) {
		throw redirect(303, `/${slug}`);
	}
	if (
		mode === "writer" &&
		role !== "owner" &&
		role !== "admin" &&
		role !== "collaborator"
	) {
		throw redirect(303, `/${slug}`);
	}
	const accessToken = (await locals.getAccessToken()) ?? "";
	const headers: Record<string, string> = {};
	if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
	return { accessToken, headers, role, slug, layout };
}

export async function coreJson(
	fetchFn: typeof fetch,
	path: string,
	headers: Record<string, string>,
): Promise<unknown | null> {
	try {
		const res = await fetchFn(`${TINYOWL_CORE_URL}${path}`, { headers });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

export function jsonArray(data: unknown, key?: string): any[] {
	if (Array.isArray(data)) return data;
	if (
		key &&
		data &&
		typeof data === "object" &&
		Array.isArray((data as Record<string, unknown>)[key])
	) {
		return (data as Record<string, any[]>)[key];
	}
	return [];
}
