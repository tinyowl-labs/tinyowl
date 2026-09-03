import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import {
	bboxFromPhotonExtent,
	photonKind,
	radiusFromSearchBBox,
	type PlaceHit,
} from "$lib/search/placeHit";
import { DEFAULT_SEARCH_RADIUS } from "$lib/search/params";

const PHOTON = "https://photon.komoot.io/api";
const UA = "echidna/0.1 (gazetteer typeahead)";
const LAYERS = ["country", "state", "county", "city"] as const;
const TTL_MS = 60_000;
const CACHE_MAX = 200;

type CacheEntry = { at: number; places: PlaceHit[] };
const cache = new Map<string, CacheEntry>();

type PhotonProps = {
	osm_type?: string;
	osm_id?: number;
	osm_key?: string;
	osm_value?: string;
	type?: string;
	name?: string;
	country?: string;
	state?: string;
	county?: string;
	city?: string;
	countrycode?: string;
	extent?: number[];
};

function cacheGet(key: string): PlaceHit[] | null {
	const hit = cache.get(key);
	if (!hit) return null;
	if (Date.now() - hit.at > TTL_MS) {
		cache.delete(key);
		return null;
	}
	return hit.places;
}

function cacheSet(key: string, places: PlaceHit[]) {
	if (cache.size >= CACHE_MAX) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
	cache.set(key, { at: Date.now(), places });
}

function osmType(raw: string | undefined): "N" | "W" | "R" | null {
	const t = (raw ?? "").toUpperCase();
	if (t === "N" || t === "W" || t === "R") return t;
	return null;
}

function mapFeature(feature: {
	properties?: PhotonProps;
	geometry?: { type?: string; coordinates?: number[] };
}): PlaceHit | null {
	const p = feature.properties ?? {};
	const kind = photonKind(p.type, p.osm_value);
	if (!kind) return null;
	const name = (p.name ?? "").trim();
	if (!name) return null;
	const coords = feature.geometry?.coordinates;
	const lng = coords?.[0];
	const lat = coords?.[1];
	const extent = bboxFromPhotonExtent(p.extent);
	const osmT = osmType(p.osm_type);
	const osmId = typeof p.osm_id === "number" ? p.osm_id : null;

	let geom: PlaceHit["geom"] | null = null;
	if (kind === "country" || kind === "admin") {
		if (!extent) return null;
		geom = { type: "bbox", ...extent };
	} else if (
		typeof lat === "number" &&
		typeof lng === "number" &&
		Number.isFinite(lat) &&
		Number.isFinite(lng)
	) {
		geom = {
			type: "point",
			lat,
			lng,
			radius: extent
				? radiusFromSearchBBox(extent)
				: DEFAULT_SEARCH_RADIUS,
		};
	}
	if (!geom) return null;

	const parent = [p.state, p.country].filter(Boolean).join(" · ");
	const kindLabel =
		kind === "country" ? "country" : kind === "admin" ? p.type || "admin" : p.type || "place";
	const cc = p.countrycode ? ` · ${p.countrycode}` : "";
	const detail = parent
		? `${kindLabel}${cc} · ${parent}`
		: `${kindLabel}${cc}`;

	const hit: PlaceHit = {
		id: osmT && osmId != null ? `photon:${osmT}${osmId}` : `photon:${name}`,
		source: "photon",
		kind,
		label: name,
		detail,
		geom,
	};
	if (osmT && osmId != null) hit.osm = { type: osmT, id: osmId };
	return hit;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const q = (url.searchParams.get("q") ?? "").trim();
	const limit = Math.min(
		8,
		Math.max(1, Number(url.searchParams.get("limit") ?? 5) || 5),
	);
	if (q.length < 2) return json({ places: [] as PlaceHit[] });

	const key = `${q.toLowerCase()}|${limit}`;
	const cached = cacheGet(key);
	if (cached) return json({ places: cached });

	const upstream = new URL(PHOTON);
	upstream.searchParams.set("q", q);
	upstream.searchParams.set("limit", String(Math.max(limit, 8)));
	upstream.searchParams.set("lang", "en");
	for (const layer of LAYERS) upstream.searchParams.append("layer", layer);

	let features: { properties?: PhotonProps; geometry?: { coordinates?: number[] } }[] =
		[];
	try {
		const res = await fetch(upstream, {
			headers: { Accept: "application/json", "User-Agent": UA },
			signal: AbortSignal.timeout(4000),
		});
		if (res.ok) {
			const body = (await res.json()) as { features?: typeof features };
			features = body.features ?? [];
		}
	} catch {
		features = [];
	}

	const places: PlaceHit[] = [];
	const seen = new Set<string>();
	for (const f of features) {
		const hit = mapFeature(f);
		if (!hit || seen.has(hit.id)) continue;
		seen.add(hit.id);
		places.push(hit);
		if (places.length >= limit) break;
	}

	cacheSet(key, places);
	return json({ places });
};
