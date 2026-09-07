import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "$lib/supabase/client";
import type { EditBufferEntry } from "$lib/geoDiff/types";
import { asGeometry, compactGeometry } from "$lib/geoDiff/geometry";

const PRESENCE_TOPIC_PREFIX = "presence:";
const CURSOR_EVENT = "cursor";
const OVERLAY_EVENT = "overlay";
const STALE_MS = 15_000;
const THROTTLE_MS = 32;
const OVERLAY_THROTTLE_MS = 200;
const MIN_MOVE_DEG = 1e-7;
export const MAX_OVERLAY_ITEMS = 40;

const CURSOR_COLORS = [
	"#0f9d8a",
	"#2563eb",
	"#c026d3",
	"#ea580c",
	"#16a34a",
	"#dc2626",
	"#7c3aed",
	"#0284c7",
];

export function peerCursorColor(userId: string): string {
	let n = 0;
	for (let i = 0; i < userId.length; i++) {
		n = (n * 33 + userId.charCodeAt(i)) >>> 0;
	}
	return CURSOR_COLORS[n % CURSOR_COLORS.length]!;
}

export type PresenceSelection = {
	table: string;
	entityId: string;
	geometry?: unknown;
};

type PresenceEditing = {
	table: string;
	entityId: string;
};

export type PresencePeer = {
	userId: string;
	displayName: string;
	lon?: number;
	lat?: number;
	h?: number;
	t?: number;
	tracking_ref?: string;
	based_on?: string;
	selection?: PresenceSelection[];
	buffer?: EditBufferEntry[];
	editing?: PresenceEditing | null;
	/** Client-only: overlay is addressed at a different develop tip. */
	overlayStale?: boolean;
};

export type PresenceOverlay = {
	tracking_ref: string;
	based_on: string;
	selection: PresenceSelection[];
	buffer: EditBufferEntry[];
	editing?: PresenceEditing | null;
};

type CursorTick = {
	user_id: string;
	lon: number;
	lat: number;
	h?: number;
	t: number;
};

type Identity = {
	user_id: string;
	display_name: string;
};

function presenceTopic(slug: string): string {
	return `${PRESENCE_TOPIC_PREFIX}${slug}`;
}

function hideStorageKey(slug: string): string {
	return `echidna:map-presence:hidden:${slug}`;
}

function parseCursorPayload(raw: unknown): CursorTick | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const user_id = typeof o.user_id === "string" ? o.user_id : "";
	const lon = typeof o.lon === "number" ? o.lon : Number.NaN;
	const lat = typeof o.lat === "number" ? o.lat : Number.NaN;
	if (!user_id || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
	if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
	const h = typeof o.h === "number" && Number.isFinite(o.h) ? o.h : undefined;
	const t = typeof o.t === "number" && Number.isFinite(o.t) ? o.t : Date.now();
	return { user_id, lon, lat, h, t };
}

function parseRef(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

function payloadHasOverlay(o: Record<string, unknown>): boolean {
	return (
		"based_on" in o ||
		"selection" in o ||
		"buffer" in o ||
		"tracking_ref" in o ||
		"editing" in o
	);
}

function parseEditing(raw: unknown): PresenceEditing | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const table = parseRef(o.table);
	const entityId = parseRef(o.entityId);
	if (!table || !entityId || table.startsWith("_")) return null;
	return { table, entityId };
}

function parseSelectionList(raw: unknown): PresenceSelection[] {
	if (!Array.isArray(raw)) return [];
	const out: PresenceSelection[] = [];
	for (const item of raw.slice(0, MAX_OVERLAY_ITEMS)) {
		if (!item || typeof item !== "object") continue;
		const o = item as Record<string, unknown>;
		const table = parseRef(o.table);
		const entityId = parseRef(o.entityId);
		if (!table || !entityId || table.startsWith("_")) continue;
		const geometry = asGeometry(o.geometry) ?? undefined;
		out.push({ table, entityId, geometry });
	}
	return out;
}

function parseBufferList(raw: unknown): EditBufferEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: EditBufferEntry[] = [];
	for (const item of raw.slice(0, MAX_OVERLAY_ITEMS)) {
		if (!item || typeof item !== "object") continue;
		const o = item as Record<string, unknown>;
		const op = o.op === "insert" || o.op === "update" || o.op === "delete" ? o.op : "";
		const table = parseRef(o.table);
		const entityId = parseRef(o.entityId);
		if (!op || !table || !entityId || table.startsWith("_")) continue;
		out.push({
			op,
			table,
			entityId,
			geometry: asGeometry(o.geometry),
			oldGeometry: asGeometry(o.oldGeometry),
		});
	}
	return out;
}

function parseOverlayPayload(raw: unknown): {
	user_id: string;
	tracking_ref: string;
	based_on: string;
	selection: PresenceSelection[];
	buffer: EditBufferEntry[];
	editing: PresenceEditing | null;
} | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const user_id = parseRef(o.user_id);
	if (!user_id || !payloadHasOverlay(o)) return null;
	return {
		user_id,
		tracking_ref: parseRef(o.tracking_ref) || "develop",
		based_on: parseRef(o.based_on),
		selection: parseSelectionList(o.selection),
		buffer: parseBufferList(o.buffer),
		editing: parseEditing(o.editing),
	};
}

function slimOverlay(overlay: PresenceOverlay): PresenceOverlay {
	return {
		tracking_ref: overlay.tracking_ref.trim() || "develop",
		based_on: overlay.based_on.trim(),
		selection: overlay.selection.slice(0, MAX_OVERLAY_ITEMS).map((s) => ({
			table: s.table,
			entityId: s.entityId,
		})),
		buffer: overlay.buffer.slice(0, MAX_OVERLAY_ITEMS).map((e) => ({
			op: e.op,
			table: e.table,
			entityId: e.entityId,
			geometry: compactGeometry(e.geometry),
			oldGeometry: compactGeometry(e.oldGeometry),
		})),
		editing: overlay.editing
			? {
					table: overlay.editing.table,
					entityId: overlay.editing.entityId,
				}
			: null,
	};
}

function overlayHasContent(overlay: PresenceOverlay | null): boolean {
	if (!overlay) return false;
	return (
		overlay.selection.length > 0 ||
		overlay.buffer.length > 0 ||
		Boolean(overlay.editing)
	);
}

function cursorMovedEnough(
	prev: { lon: number; lat: number } | null,
	lon: number,
	lat: number,
): boolean {
	if (!prev) return true;
	const dlon = lon - prev.lon;
	const dlat = lat - prev.lat;
	return dlon * dlon + dlat * dlat >= MIN_MOVE_DEG * MIN_MOVE_DEG;
}

function dropStaleTicks(
	peers: Map<string, PresencePeer>,
	now = Date.now(),
): boolean {
	let changed = false;
	for (const peer of peers.values()) {
		if (peer.t == null) continue;
		if (now - peer.t <= STALE_MS) continue;
		peer.lon = undefined;
		peer.lat = undefined;
		peer.h = undefined;
		peer.t = undefined;
		changed = true;
	}
	return changed;
}

function readHidden(slug: string): boolean {
	try {
		return localStorage.getItem(hideStorageKey(slug)) === "1";
	} catch {
		return false;
	}
}

function writeHidden(slug: string, hidden: boolean) {
	try {
		if (hidden) localStorage.setItem(hideStorageKey(slug), "1");
		else localStorage.removeItem(hideStorageKey(slug));
	} catch {
		/* ignore */
	}
}

export function displayNameFromUser(user: {
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
} | null | undefined): string {
	const meta = user?.user_metadata ?? {};
	const str = (key: string) => {
		const v = meta[key];
		return typeof v === "string" ? v.trim() : "";
	};
	const combined = `${str("first_name")} ${str("last_name")}`.trim();
	const name =
		str("full_name") || str("name") || str("display_name") || combined;
	if (name) return name;
	const email = (user?.email ?? "").trim();
	const at = email.indexOf("@");
	return at > 0 ? email.slice(0, at) : "";
}

async function loadIdentity(
	userId: string,
	token: string,
	user: {
		email?: string | null;
		user_metadata?: Record<string, unknown> | null;
	} | null,
): Promise<Identity> {
	try {
		const res = await fetch("/api/v1/me", {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.ok) {
			const body = (await res.json()) as {
				display_name?: string;
				name?: string;
			};
			const name = (body.display_name || body.name || "").trim();
			if (name) return { user_id: userId, display_name: name };
		}
	} catch {
		/* fall through */
	}
	return {
		user_id: userId,
		display_name: displayNameFromUser(user) || "Collaborator",
	};
}

export type MapPresenceHandle = {
	hidden: boolean;
	setHidden: (hidden: boolean) => Promise<void>;
	setPageVisible: (visible: boolean) => Promise<void>;
	publishCursor: (lon: number, lat: number, h?: number) => void;
	publishOverlay: (overlay: PresenceOverlay) => void;
	stop: () => Promise<void>;
};

export async function connectMapPresence(opts: {
	slug: string;
	userId: string;
	onPeers: (peers: PresencePeer[]) => void;
	onHidden?: (hidden: boolean) => void;
}): Promise<MapPresenceHandle | null> {
	const slug = opts.slug.trim();
	const userId = opts.userId.trim();
	if (!slug || !userId) return null;

	const supabase: SupabaseClient = createClient();
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token || data.session?.user.id !== userId) return null;

	await supabase.realtime.setAuth(token);

	const topic = presenceTopic(slug);
	const leftover = supabase.getChannels().filter((ch) => {
		const t = ch.topic ?? "";
		return t === topic || t === `realtime:${topic}`;
	});
	await Promise.all(leftover.map((ch) => supabase.removeChannel(ch)));

	const identity = await loadIdentity(userId, token, data.session?.user ?? null);
	const peers = new Map<string, PresencePeer>();
	let hidden = readHidden(slug);
	let pageVisible = typeof document === "undefined" ? true : !document.hidden;
	let lastSent: { lon: number; lat: number } | null = null;
	let lastSentAt = 0;
	let overlayTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingOverlay: PresenceOverlay | null = null;
	let lastSlimOverlay: PresenceOverlay | null = null;
	let staleTimer: ReturnType<typeof setInterval> | null = null;
	let stopped = false;

	const emit = () => {
		opts.onPeers([...peers.values()].filter((p) => p.userId !== userId));
	};

	const channel: RealtimeChannel = supabase.channel(topic, {
		config: {
			private: true,
			broadcast: { self: false },
			presence: { key: userId },
		},
	});

	const applyPresence = () => {
		const state = channel.presenceState() as Record<
			string,
			Array<{ user_id?: string; display_name?: string }>
		>;
		const seen = new Set<string>();
		for (const [key, metas] of Object.entries(state)) {
			const meta = metas[0];
			const id = (meta?.user_id || key).trim();
			if (!id || id === userId) continue;
			seen.add(id);
			const existing = peers.get(id);
			const displayName =
				(meta?.display_name || "").trim() ||
				existing?.displayName ||
				"Collaborator";
			if (existing) existing.displayName = displayName;
			else peers.set(id, { userId: id, displayName });
		}
		for (const id of [...peers.keys()]) {
			if (!seen.has(id)) peers.delete(id);
		}
		emit();
	};

	const applyOverlay = (overlay: {
		user_id: string;
		tracking_ref: string;
		based_on: string;
		selection: PresenceSelection[];
		buffer: EditBufferEntry[];
		editing: PresenceEditing | null;
	}) => {
		if (overlay.user_id === userId) return;
		const existing = peers.get(overlay.user_id);
		if (!existing) {
			peers.set(overlay.user_id, {
				userId: overlay.user_id,
				displayName: "Collaborator",
				tracking_ref: overlay.tracking_ref,
				based_on: overlay.based_on,
				selection: overlay.selection,
				buffer: overlay.buffer,
				editing: overlay.editing,
			});
		} else {
			existing.tracking_ref = overlay.tracking_ref;
			existing.based_on = overlay.based_on;
			existing.selection = overlay.selection;
			existing.buffer = overlay.buffer;
			existing.editing = overlay.editing;
		}
		emit();
	};

	channel
		.on("presence", { event: "sync" }, () => applyPresence())
		.on("broadcast", { event: CURSOR_EVENT }, ({ payload }) => {
			const tick = parseCursorPayload(payload);
			if (!tick || tick.user_id === userId) return;
			const existing = peers.get(tick.user_id);
			if (!existing) {
				peers.set(tick.user_id, {
					userId: tick.user_id,
					displayName: "Collaborator",
					lon: tick.lon,
					lat: tick.lat,
					h: tick.h,
					t: tick.t,
				});
			} else {
				existing.lon = tick.lon;
				existing.lat = tick.lat;
				existing.h = tick.h;
				existing.t = tick.t;
			}
			const overlay = parseOverlayPayload(payload);
			if (overlay) applyOverlay(overlay);
			else emit();
		})
		.on("broadcast", { event: OVERLAY_EVENT }, ({ payload }) => {
			const overlay = parseOverlayPayload(payload);
			if (overlay) applyOverlay(overlay);
		});

	const subscribed = await new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), 8_000);
		channel.subscribe((status) => {
			if (status === "SUBSCRIBED") {
				clearTimeout(timer);
				resolve(true);
			}
			if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
				clearTimeout(timer);
				resolve(false);
			}
		});
	});

	if (!subscribed || stopped) {
		if (!subscribed) {
			console.warn("[presence] private channel join failed", slug);
		}
		await supabase.removeChannel(channel);
		return null;
	}

	const track = async () => {
		if (stopped || hidden || !pageVisible) return;
		await channel.track(identity);
	};
	const untrack = async () => {
		try {
			await channel.untrack();
		} catch {
			/* ignore */
		}
	};

	const flushOverlay = (overlay: PresenceOverlay) => {
		if (stopped) return;
		const now = Date.now();
		const slim = slimOverlay(overlay);
		lastSlimOverlay = slim;
		const payload = {
			user_id: userId,
			t: now,
			tracking_ref: slim.tracking_ref,
			based_on: slim.based_on,
			selection: slim.selection,
			buffer: slim.buffer,
			editing: slim.editing ?? null,
		};
		void channel
			.send({
				type: "broadcast",
				event: OVERLAY_EVENT,
				payload,
			})
			.then((status) => {
				if (status !== "ok") {
					console.warn(
						"[presence] overlay send failed",
						status,
						JSON.stringify(payload).length,
					);
				}
			});
	};

	const sendOverlay = (overlay: PresenceOverlay, force = false) => {
		if (stopped) return;
		pendingOverlay = overlay;
		if (force) {
			if (overlayTimer) {
				clearTimeout(overlayTimer);
				overlayTimer = null;
			}
			flushOverlay(overlay);
			return;
		}
		if (overlayTimer) return;
		overlayTimer = setTimeout(() => {
			overlayTimer = null;
			if (pendingOverlay) flushOverlay(pendingOverlay);
		}, OVERLAY_THROTTLE_MS);
	};

	const clearOverlay = () => {
		sendOverlay(
			{
				tracking_ref: "develop",
				based_on: "",
				selection: [],
				buffer: [],
				editing: null,
			},
			true,
		);
	};

	if (!hidden && pageVisible) await track();
	opts.onHidden?.(hidden);

	staleTimer = setInterval(() => {
		if (dropStaleTicks(peers)) emit();
	}, 5_000);

	const handle: MapPresenceHandle = {
		get hidden() {
			return hidden;
		},
		setHidden: async (next: boolean) => {
			hidden = next;
			writeHidden(slug, next);
			opts.onHidden?.(next);
			if (next) {
				clearOverlay();
				await untrack();
			} else if (pageVisible) await track();
		},
		setPageVisible: async (visible: boolean) => {
			pageVisible = visible;
			if (!visible) {
				clearOverlay();
				await untrack();
			} else if (!hidden) await track();
		},
		publishCursor: (lon, lat, h) => {
			if (stopped || hidden || !pageVisible) return;
			const now = Date.now();
			if (now - lastSentAt < THROTTLE_MS) return;
			if (!cursorMovedEnough(lastSent, lon, lat)) return;
			lastSentAt = now;
			lastSent = { lon, lat };
			const payload: Record<string, unknown> = {
				user_id: userId,
				lon,
				lat,
				h,
				t: now,
			};
			if (overlayHasContent(lastSlimOverlay) && lastSlimOverlay) {
				payload.tracking_ref = lastSlimOverlay.tracking_ref;
				payload.based_on = lastSlimOverlay.based_on;
				payload.selection = lastSlimOverlay.selection;
				payload.buffer = lastSlimOverlay.buffer;
				payload.editing = lastSlimOverlay.editing ?? null;
			}
			void channel.send({
				type: "broadcast",
				event: CURSOR_EVENT,
				payload,
			});
		},
		publishOverlay: (overlay) => {
			if (stopped || hidden || !pageVisible) return;
			sendOverlay(overlay, true);
		},
		stop: async () => {
			if (stopped) return;
			if (overlayTimer) {
				clearTimeout(overlayTimer);
				overlayTimer = null;
			}
			clearOverlay();
			stopped = true;
			if (staleTimer) clearInterval(staleTimer);
			staleTimer = null;
			await untrack();
			await supabase.removeChannel(channel);
			peers.clear();
			opts.onPeers([]);
		},
	};

	return handle;
}
