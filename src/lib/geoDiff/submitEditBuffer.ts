import type { EditBufferEntry } from "./types";

export type EditBufferSubmitResult = {
	status: string;
	commit_id: string;
	changeset_id: string;
	develop: string;
	main: string;
	target_ref: string;
	server_head: string;
	message: string;
	error?: string;
};

export async function fetchDevelopTip(
	slug: string,
	accessToken: string,
): Promise<string> {
	const headers: Record<string, string> = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/refs`,
		{ headers },
	);
	if (!res.ok) return "";
	const data = (await res.json().catch(() => ({}))) as { develop?: string };
	return typeof data.develop === "string" ? data.develop : "";
}

function authHeaders(accessToken: string, message: string): HeadersInit {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-TinyOwl-Message": message,
		"X-TinyOwl-Target-Ref": "develop",
	};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	return headers;
}

/** POST the session buffer as a commit on develop (no pending supersede). */
export async function submitEditBuffer(
	slug: string,
	accessToken: string,
	message: string,
	entries: EditBufferEntry[],
): Promise<EditBufferSubmitResult> {
	const trimmed = message.trim();
	if (!trimmed) throw new Error("Commit message required");
	if (entries.length === 0) throw new Error("Empty edit buffer");
	const baseCommit = await fetchDevelopTip(slug, accessToken);
	const headers = {
		...authHeaders(accessToken, trimmed),
		...(baseCommit ? { "X-TinyOwl-Base-Commit": baseCommit } : {}),
	};
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/edit-buffer`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				message: trimmed,
				base_commit: baseCommit,
				target_ref: "develop",
				entries,
			}),
		},
	);
	const data = (await res.json().catch(() => ({}))) as {
		error?: string;
		status?: string;
		commit_id?: string;
		changeset_id?: string;
		develop?: string;
		main?: string;
		target_ref?: string;
		server_head?: string;
		message?: string;
	};
	const commitId = data.commit_id || data.changeset_id || "";
	if (data.status === "conflicted") {
		return {
			status: "conflicted",
			commit_id: commitId,
			changeset_id: commitId,
			develop: data.develop ?? "",
			main: data.main ?? "",
			target_ref: data.target_ref ?? "develop",
			server_head: String(data.server_head ?? ""),
			message: data.message ?? trimmed,
			error:
				data.error ||
				"Conflicts with develop; the unmerged commit is kept. Re-commit against current develop.",
		};
	}
	if (!res.ok) {
		throw new Error(data.error || `Commit failed (${res.status})`);
	}
	if (!commitId) {
		throw new Error("Commit did not return a commit id");
	}
	return {
		status: data.status ?? "committed",
		commit_id: commitId,
		changeset_id: commitId,
		develop: data.develop ?? "",
		main: data.main ?? "",
		target_ref: data.target_ref ?? "develop",
		server_head: String(data.server_head ?? ""),
		message: data.message ?? trimmed,
	};
}
