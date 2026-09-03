import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "$lib/supabase/client";
import { asGeometry, type GeoJsonGeometry } from "$lib/geoDiff";

export type CommentStatus = "open" | "resolved";

export type CommentAuthor = {
	id: string;
	display_name: string;
	has_avatar: boolean;
};

export type MapComment = {
	id: string;
	project_slug: string;
	body: string;
	status: CommentStatus;
	parent_id: string | null;
	layer_name: string | null;
	feature_id: string | null;
	lon: number;
	lat: number;
	geometry?: GeoJsonGeometry | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	author: CommentAuthor;
};

export type CommentDraft = {
	lon: number;
	lat: number;
	layerName?: string;
	featureId?: string;
	geometry?: GeoJsonGeometry;
};

export type CommentFilter = "open" | "resolved" | "all";

export const COMMENTS_TOPIC_PREFIX = "comments:";
export const COMMENT_EVENT = "comment";

export function commentsTopic(slug: string): string {
	return `${COMMENTS_TOPIC_PREFIX}${slug.trim()}`;
}

function authHeaders(accessToken: string): HeadersInit {
	return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function commentsUrl(slug: string): string {
	return `/api/v1/projects/${encodeURIComponent(slug)}/comments`;
}

export async function fetchComments(
	slug: string,
	accessToken: string,
): Promise<MapComment[]> {
	const res = await fetch(commentsUrl(slug), { headers: authHeaders(accessToken) });
	if (res.status === 403) return [];
	if (!res.ok) throw new Error("Could not load comments");
	const data = (await res.json()) as { comments?: MapComment[] };
	return (data.comments ?? []).map((c) => ({
		...c,
		geometry: asGeometry(c.geometry) ?? c.geometry ?? null,
	}));
}

export async function createComment(
	slug: string,
	accessToken: string,
	body: {
		body: string;
		parent_id?: string;
		layer_name?: string;
		feature_id?: string;
		lon?: number;
		lat?: number;
		geometry?: GeoJsonGeometry;
	},
): Promise<MapComment> {
	const res = await fetch(commentsUrl(slug), {
		method: "POST",
		headers: {
			...authHeaders(accessToken),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			typeof err?.error === "string" ? err.error : "Could not post comment",
		);
	}
	return (await res.json()) as MapComment;
}

export async function patchComment(
	slug: string,
	accessToken: string,
	id: string,
	body: { body?: string; status?: CommentStatus },
): Promise<MapComment> {
	const res = await fetch(`${commentsUrl(slug)}/${encodeURIComponent(id)}`, {
		method: "PATCH",
		headers: {
			...authHeaders(accessToken),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			typeof err?.error === "string" ? err.error : "Could not update comment",
		);
	}
	return (await res.json()) as MapComment;
}

export async function deleteComment(
	slug: string,
	accessToken: string,
	id: string,
): Promise<void> {
	const res = await fetch(`${commentsUrl(slug)}/${encodeURIComponent(id)}`, {
		method: "DELETE",
		headers: authHeaders(accessToken),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			typeof err?.error === "string" ? err.error : "Could not delete comment",
		);
	}
}

export function commentRoots(comments: MapComment[], filter: CommentFilter): MapComment[] {
	return comments.filter((c) => {
		if (c.parent_id) return false;
		if (filter === "all") return true;
		return c.status === filter;
	});
}

export function commentReplies(comments: MapComment[], rootId: string): MapComment[] {
	return comments.filter((c) => c.parent_id === rootId);
}

export function threadCount(comments: MapComment[], rootId: string): number {
	return 1 + commentReplies(comments, rootId).length;
}

export type CommentsRealtimeHandle = {
	notify: () => void;
	stop: () => Promise<void>;
};

export async function subscribeComments(opts: {
	slug: string;
	userId: string;
	onChange: () => void;
}): Promise<CommentsRealtimeHandle | null> {
	const slug = opts.slug.trim();
	const userId = opts.userId.trim();
	if (!slug || !userId) return null;

	const supabase: SupabaseClient = createClient();
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token || data.session?.user.id !== userId) return null;

	await supabase.realtime.setAuth(token);

	const topic = commentsTopic(slug);
	const leftover = supabase.getChannels().filter((ch) => {
		const t = ch.topic ?? "";
		return t === topic || t === `realtime:${topic}`;
	});
	await Promise.all(leftover.map((ch) => supabase.removeChannel(ch)));

	let stopped = false;
	const fire = () => {
		if (!stopped) opts.onChange();
	};

	const channel: RealtimeChannel = supabase.channel(topic, {
		config: {
			private: true,
			broadcast: { ack: false, self: false },
		},
	});

	channel.on("broadcast", { event: COMMENT_EVENT }, () => fire());
	channel.on(
		"postgres_changes",
		{ event: "*", schema: "public", table: "comments", filter: `project_slug=eq.${slug}` },
		() => fire(),
	);

	await new Promise<void>((resolve) => {
		channel.subscribe((status) => {
			if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
				resolve();
			}
		});
	});

	return {
		notify() {
			void channel.send({
				type: "broadcast",
				event: COMMENT_EVENT,
				payload: { t: Date.now() },
			});
		},
		async stop() {
			stopped = true;
			await supabase.removeChannel(channel);
		},
	};
}
