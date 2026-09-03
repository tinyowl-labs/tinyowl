import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import type { PleiadesPlace } from "$lib/search/pleiades";
import { radiusFromBbox, searchIndexedPleiades } from "$lib/search/pleiadesIndex.server";

const IDAI = "https://gazetteer.dainst.org/search.json";
const PLEIADES_PLACE = "https://pleiades.stoa.org/places";
const UA = "echidna/0.1 (gazetteer typeahead)";

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

async function searchIdai(
	fetchFn: typeof fetch,
	q: string,
	limit: number,
): Promise<PleiadesPlace[]> {
	if (/^\d{4,}$/.test(q)) {
		const rec = await fetchPleiadesJson(fetchFn, q);
		if (!rec) return [];
		return [
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
		];
	}

	let hits: IdaiHit[] = [];
	try {
		const upstream = new URL(IDAI);
		upstream.searchParams.set("q", q);
		upstream.searchParams.set("limit", "16");
		const res = await fetchFn(upstream, {
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
	return places.slice(0, limit);
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const q = (url.searchParams.get("q") ?? "").trim();
	const limit = Math.min(
		16,
		Math.max(1, Number(url.searchParams.get("limit") ?? 8) || 8),
	);
	if (q.length < 2) {
		return json({ places: [] as PleiadesPlace[], backend: "none" });
	}

	const local = searchIndexedPleiades(q, limit);
	if (local) {
		return json({ places: local, backend: "local" });
	}

	const places = await searchIdai(fetch, q, limit);
	return json({ places, backend: "idai" });
};
