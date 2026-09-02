import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";

export type PleiadesPlace = {
	id: string;
	title: string;
	description: string;
	lat: number;
	lng: number;
	radius: number;
	uri: string;
	types: string[];
};

const IDAI = "https://gazetteer.dainst.org/search.json";
const PLEIADES_PLACE = "https://pleiades.stoa.org/places";
const UA = "echidna/0.1 (gazetteer typeahead)";

function haversineMetres(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function radiusFromBbox(
	bbox: number[] | null | undefined,
	fallback = 10000,
): number {
	if (!bbox || bbox.length < 4) return fallback;
	const [west, south, east, north] = bbox;
	if (![west, south, east, north].every((n) => typeof n === "number")) {
		return fallback;
	}
	const midLat = (south + north) / 2;
	const width = haversineMetres(midLat, west, midLat, east);
	const height = haversineMetres(south, west, north, west);
	const m = Math.max(width, height) * 0.55;
	return Math.min(50_000, Math.max(1_500, Math.round(m)));
}

type IdaiHit = {
	prefName?: { title?: string };
	types?: string[];
	prefLocation?: { coordinates?: number[] };
	identifiers?: { value?: string; context?: string }[];
};

async function fetchPleiadesJson(
	fetchFn: typeof fetch,
	id: string,
): Promise<{
	title: string;
	description: string;
	lat: number;
	lng: number;
	radius: number;
} | null> {
	try {
		const res = await fetchFn(`${PLEIADES_PLACE}/${id}/json`, {
			headers: { Accept: "application/json", "User-Agent": UA },
			signal: AbortSignal.timeout(2500),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			title?: string;
			description?: string;
			reprPoint?: number[];
			bbox?: number[];
		};
		const lng = body.reprPoint?.[0];
		const lat = body.reprPoint?.[1];
		if (typeof lat !== "number" || typeof lng !== "number") return null;
		return {
			title: (body.title ?? "").trim() || id,
			description: (body.description ?? "").trim(),
			lat,
			lng,
			radius: radiusFromBbox(body.bbox),
		};
	} catch {
		return null;
	}
}

function pleiadesIdFromHit(hit: IdaiHit): string | null {
	for (const id of hit.identifiers ?? []) {
		if (String(id.context ?? "").toLowerCase() !== "pleiades") continue;
		const v = String(id.value ?? "").trim();
		if (/^\d+$/.test(v)) return v;
	}
	return null;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const q = (url.searchParams.get("q") ?? "").trim();
	const limit = Math.min(
		16,
		Math.max(1, Number(url.searchParams.get("limit") ?? 8) || 8),
	);
	if (q.length < 2) return json({ places: [] as PleiadesPlace[] });

	if (/^\d{4,}$/.test(q)) {
		const rec = await fetchPleiadesJson(fetch, q);
		if (!rec) return json({ places: [] as PleiadesPlace[] });
		return json({
			places: [
				{
					id: q,
					title: rec.title,
					description: rec.description,
					lat: rec.lat,
					lng: rec.lng,
					radius: rec.radius,
					uri: `${PLEIADES_PLACE}/${q}`,
					types: [],
				} satisfies PleiadesPlace,
			],
		});
	}

	// Pleiades site search is behind bot-protection; iDAI is a public index
	// that carries Pleiades place ids. Canonical coords/names come from
	// https://pleiades.stoa.org/places/{id}/json.
	let hits: IdaiHit[] = [];
	try {
		const upstream = new URL(IDAI);
		upstream.searchParams.set("q", q);
		upstream.searchParams.set("limit", "16");
		const res = await fetch(upstream, {
			headers: { Accept: "application/json", "User-Agent": UA },
			signal: AbortSignal.timeout(4000),
		});
		if (res.ok) {
			const body = (await res.json()) as { result?: IdaiHit[] };
			hits = body.result ?? [];
		}
	} catch {
		hits = [];
	}

	const withId: { hit: IdaiHit; id: string }[] = [];
	const seen = new Set<string>();
	for (const hit of hits) {
		const id = pleiadesIdFromHit(hit);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		withId.push({ hit, id });
		if (withId.length >= limit) break;
	}

	// Typeahead must stay snappy: iDAI already has names + coords. Pleiades
	// JSON is behind a slow CDN and was the multi-second delay on each keystroke.
	const places: PleiadesPlace[] = [];
	for (const { hit, id } of withId) {
		const coords = hit.prefLocation?.coordinates;
		const lng = coords?.[0];
		const lat = coords?.[1];
		if (typeof lat !== "number" || typeof lng !== "number") continue;
		places.push({
			id,
			title: hit.prefName?.title || id,
			description: "",
			lat,
			lng,
			radius: 10_000,
			uri: `${PLEIADES_PLACE}/${id}`,
			types: hit.types ?? [],
		});
	}

	places.sort((a, b) => a.title.localeCompare(b.title));
	return json({ places: places.slice(0, limit) });
};
