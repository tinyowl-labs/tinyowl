import type { EditBufferEntry } from "./types";

export type EditBufferSubmitResult = {
	status: string;
	changeset_id: string;
	server_head: string;
	message: string;
};

function authHeaders(accessToken: string, message: string): HeadersInit {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-TinyOwl-Message": message,
	};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	return headers;
}

/** POST the session buffer as a pending changeset (no canonical write). */
export async function submitEditBuffer(
	slug: string,
	accessToken: string,
	message: string,
	entries: EditBufferEntry[],
): Promise<EditBufferSubmitResult> {
	const trimmed = message.trim();
	if (!trimmed) throw new Error("Commit message required");
	if (entries.length === 0) throw new Error("Empty edit buffer");
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/edit-buffer`,
		{
			method: "POST",
			headers: authHeaders(accessToken, trimmed),
			body: JSON.stringify({ message: trimmed, entries }),
		},
	);
	const data = (await res.json().catch(() => ({}))) as {
		error?: string;
		status?: string;
		changeset_id?: string;
		server_head?: string;
		message?: string;
	};
	if (!res.ok) {
		throw new Error(data.error || `Commit failed (${res.status})`);
	}
	if (!data.changeset_id) {
		throw new Error("Commit did not return a changeset");
	}
	return {
		status: data.status ?? "pending",
		changeset_id: data.changeset_id,
		server_head: String(data.server_head ?? ""),
		message: data.message ?? trimmed,
	};
}
