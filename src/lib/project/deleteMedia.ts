/** Browser client for DELETE /api/v1/projects/{slug}/media/{hash}. */

export type DeleteMediaResult = {
	status: "removed" | "committed";
	mediaHash: string;
	blobDeleted: boolean;
	unlinked: number;
	keptOnMain: boolean;
	commitId?: string;
};

export class DeleteMediaError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "DeleteMediaError";
		this.status = status;
	}
}

function parseError(text: string, status: number): string {
	try {
		const body = JSON.parse(text) as { error?: string; message?: string };
		if (body.error) return String(body.error);
		if (body.message) return String(body.message);
	} catch {
		/* not JSON */
	}
	const trimmed = text.trim();
	if (trimmed) return trimmed.slice(0, 240);
	return `Remove failed (${status})`;
}

export function isMessageRequiredError(err: unknown): boolean {
	if (!(err instanceof DeleteMediaError)) return false;
	return (
		err.status === 400 && /message required/i.test(err.message)
	);
}

export async function deleteProjectMedia(opts: {
	projectSlug: string;
	accessToken: string;
	hash: string;
	message?: string;
}): Promise<DeleteMediaResult> {
	const { projectSlug, accessToken, hash } = opts;
	if (!accessToken) throw new Error("Sign in to remove media");
	if (!hash) throw new Error("media hash required");

	const message = opts.message?.trim() ?? "";
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
	};
	if (message) {
		headers["Content-Type"] = "application/json";
		headers["X-TinyOwl-Message"] = message;
	}

	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(projectSlug)}/media/${encodeURIComponent(hash)}`,
		{
			method: "DELETE",
			headers,
			body: message ? JSON.stringify({ message }) : undefined,
		},
	);
	const text = await res.text();
	if (!res.ok) {
		throw new DeleteMediaError(res.status, parseError(text, res.status));
	}

	let payload: {
		status?: string;
		media_hash?: string;
		blob_deleted?: boolean;
		unlinked?: number;
		kept_on_main?: boolean;
		commit_id?: string;
	} = {};
	try {
		payload = JSON.parse(text) as typeof payload;
	} catch {
		throw new Error("Remove succeeded but the server response was not JSON");
	}

	return {
		status: payload.status === "committed" ? "committed" : "removed",
		mediaHash: payload.media_hash || hash,
		blobDeleted: payload.blob_deleted === true,
		unlinked: Number(payload.unlinked ?? 0),
		keptOnMain: payload.kept_on_main === true,
		commitId: payload.commit_id || undefined,
	};
}
