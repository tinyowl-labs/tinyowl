import type { PresencePeer } from "$lib/map-presence";
import { peerCursorColor } from "$lib/map-presence";

/**
 * Playback delay so we interpolate *between* samples instead of chasing the
 * latest tick. ~1.5× the 32 ms send interval.
 */
const DELAY_MS = 50;
const MAX_SAMPLES = 8;

export type PresenceRosterCursor = {
	userId: string;
	displayName: string;
	color: string;
};

type Vec = { x: number; y: number; z: number };
type Sample = { t: number; p: Vec };

export type PresenceLayer = {
	sync: (peers: PresencePeer[]) => void;
	destroy: () => void;
};

type Track = {
	userId: string;
	displayName: string;
	color: string;
	samples: Sample[];
};

function vsub(a: Vec, b: Vec): Vec {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vadd(a: Vec, b: Vec): Vec {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function vscale(a: Vec, s: number): Vec {
	return { x: a.x * s, y: a.y * s, z: a.z * s };
}

/** Velocity between two timestamped samples (units / ms). */
function vel(a: Sample, b: Sample): Vec {
	const dt = b.t - a.t;
	if (dt <= 1e-3) return { x: 0, y: 0, z: 0 };
	return vscale(vsub(b.p, a.p), 1 / dt);
}

/**
 * Cubic Hermite (Catmull–Rom tangents) between p1 and p2.
 * C1-smooth through Broadcast samples; time-parameterized so irregular
 * packets don’t bunch. No per-segment ease-in-out (that pulsed at 30 Hz).
 */
function hermite(p1: Vec, m1: Vec, p2: Vec, m2: Vec, u: number, span: number): Vec {
	const u2 = u * u;
	const u3 = u2 * u;
	const h00 = 2 * u3 - 3 * u2 + 1;
	const h10 = u3 - 2 * u2 + u;
	const h01 = -2 * u3 + 3 * u2;
	const h11 = u3 - u2;
	return vadd(
		vadd(vscale(p1, h00), vscale(m1, h10 * span)),
		vadd(vscale(p2, h01), vscale(m2, h11 * span)),
	);
}

function positionAt(samples: Sample[], time: number): Vec | null {
	if (samples.length === 0) return null;
	if (samples.length === 1 || time <= samples[0]!.t) return samples[0]!.p;
	const last = samples[samples.length - 1]!;
	if (time >= last.t) return last.p;

	let i = 0;
	for (; i < samples.length - 2; i++) {
		if (time < samples[i + 1]!.t) break;
	}
	const s0 = samples[Math.max(0, i - 1)]!;
	const s1 = samples[i]!;
	const s2 = samples[i + 1]!;
	const s3 = samples[Math.min(samples.length - 1, i + 2)]!;
	const span = Math.max(1, s2.t - s1.t);
	const u = Math.min(1, Math.max(0, (time - s1.t) / span));
	const m1 = vel(s0, s2);
	const m2 = vel(s1, s3);
	return hermite(s1.p, m1, s2.p, m2, u, span);
}

/**
 * Animate HTML cursors on rAF. Curve: delayed cubic Hermite through samples.
 * Positions are written to DOM nodes (not Svelte state) so 60 Hz isn’t
 * gated on component invalidation.
 */
export function createPresenceLayer(
	Cesium: typeof import("cesium") | any,
	viewer: any,
	opts: {
		onRoster: (cursors: PresenceRosterCursor[]) => void;
		node: (userId: string) => HTMLElement | undefined;
	},
): PresenceLayer {
	const tracks = new Map<string, Track>();
	let raf = 0;
	let removeCam: (() => void) | null = null;
	let rosterSig = "";

	function cartesian(peer: PresencePeer): Vec {
		const c = Cesium.Cartesian3.fromDegrees(
			peer.lon as number,
			peer.lat as number,
			peer.h ?? 0,
		);
		return { x: c.x as number, y: c.y as number, z: c.z as number };
	}

	function pushSample(track: Track, p: Vec, t: number) {
		const prev = track.samples[track.samples.length - 1];
		if (prev && t - prev.t < 4) {
			prev.p = p;
			prev.t = t;
			return;
		}
		track.samples.push({ t, p });
		if (track.samples.length > MAX_SAMPLES) track.samples.shift();
	}

	function paint(now: number) {
		if (!viewer || viewer.isDestroyed?.()) return;
		const play = now - DELAY_MS;
		const canvas = viewer.scene?.canvas;
		const w = canvas?.clientWidth ?? 0;
		const h = canvas?.clientHeight ?? 0;
		const scratch = new Cesium.Cartesian3();

		for (const track of tracks.values()) {
			const pos = positionAt(track.samples, play);
			const el = opts.node(track.userId);
			if (!pos || !el) continue;
			scratch.x = pos.x;
			scratch.y = pos.y;
			scratch.z = pos.z;
			const win = Cesium.SceneTransforms.worldToWindowCoordinates(
				viewer.scene,
				scratch,
			);
			if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
				el.style.visibility = "hidden";
				continue;
			}
			if (win.x < -48 || win.y < -48 || win.x > w + 48 || win.y > h + 48) {
				el.style.visibility = "hidden";
				continue;
			}
			el.style.visibility = "visible";
			el.style.transform = `translate3d(${win.x}px, ${win.y}px, 0)`;
		}
	}

	function loop(now: number) {
		raf = 0;
		if (tracks.size === 0 || !viewer || viewer.isDestroyed?.()) return;
		paint(now);
		raf = requestAnimationFrame(loop);
	}

	function kick() {
		if (!raf && tracks.size > 0) raf = requestAnimationFrame(loop);
	}

	function emitRoster() {
		const list: PresenceRosterCursor[] = [...tracks.values()].map((t) => ({
			userId: t.userId,
			displayName: t.displayName,
			color: t.color,
		}));
		const sig = list.map((c) => `${c.userId}:${c.displayName}`).join("|");
		if (sig === rosterSig) return;
		rosterSig = sig;
		opts.onRoster(list);
	}

	try {
		removeCam = viewer.camera.changed.addEventListener(() => kick());
	} catch {
		/* ignore */
	}

	return {
		sync(peers) {
			const keep = new Set<string>();
			const now = performance.now();
			for (const peer of peers) {
				if (peer.lon == null || peer.lat == null) continue;
				keep.add(peer.userId);
				const p = cartesian(peer);
				let track = tracks.get(peer.userId);
				if (!track) {
					track = {
						userId: peer.userId,
						displayName: peer.displayName,
						color: peerCursorColor(peer.userId),
						samples: [{ t: now, p }],
					};
					tracks.set(peer.userId, track);
				} else {
					track.displayName = peer.displayName;
					pushSample(track, p, now);
				}
			}
			for (const id of [...tracks.keys()]) {
				if (!keep.has(id)) tracks.delete(id);
			}
			emitRoster();
			if (tracks.size === 0) {
				if (raf) cancelAnimationFrame(raf);
				raf = 0;
				return;
			}
			kick();
		},
		destroy() {
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			try {
				removeCam?.();
			} catch {
				/* ignore */
			}
			removeCam = null;
			tracks.clear();
			rosterSig = "";
			opts.onRoster([]);
		},
	};
}
