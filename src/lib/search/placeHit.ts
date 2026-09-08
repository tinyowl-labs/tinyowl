/** Unified omnibox place hit (Pleiades + Natural Earth + GeoNames). */

import { haversineMetres } from "$lib/geo/haversine";
import {
	DEFAULT_SEARCH_RADIUS,
	parseBBox,
	type SearchBBox,
} from "./params";
import type { PleiadesPlace } from "./pleiades";

export type PlaceKind = "country" | "admin" | "ancient" | "place";
export type PlaceSource = "pleiades" | "naturalearth" | "geonames";

export type GeomHint =
	| { type: "point"; lat: number; lng: number; radius: number }
	| { type: "bbox"; west: number; south: number; east: number; north: number };

export type PlaceHit = {
	id: string;
	source: PlaceSource;
	kind: PlaceKind;
	label: string;
	detail: string;
	geom: GeomHint;
	uri?: string;
	cc?: string;
};

export function radiusFromSearchBBox(
	bbox: SearchBBox,
	fallback = DEFAULT_SEARCH_RADIUS,
): number {
	const midLat = (bbox.south + bbox.north) / 2;
	const width = haversineMetres(midLat, bbox.west, midLat, bbox.east);
	const height = haversineMetres(bbox.south, bbox.west, bbox.north, bbox.west);
	const m = Math.max(width, height) * 0.55;
	if (!Number.isFinite(m)) return fallback;
	return Math.min(50_000, Math.max(1_500, Math.round(m)));
}

export function pleiadesToHit(place: PleiadesPlace): PlaceHit {
	const type = place.types[0]?.replace(/_/g, " ") || "ancient place";
	const detail = place.description
		? `${type} · ${place.description}`
		: type;
	return {
		id: `pleiades:${place.id}`,
		source: "pleiades",
		kind: "ancient",
		label: place.title,
		detail,
		geom: {
			type: "point",
			lat: place.lat,
			lng: place.lng,
			radius: place.radius,
		},
		uri: place.uri,
	};
}

export function labelMatchRank(query: string, label: string): number {
	const q = query.trim().toLowerCase();
	const n = label.trim().toLowerCase();
	if (!q || !n) return 9;
	if (n === q) return 0;
	const words = n.split(/[\s,/()·.–_-]+/).filter(Boolean);
	if words.some((w) => w === q)) return 1;
	if (n.startsWith(q)) return 2;
	if (words.some((w) => w.startsWith(q))) return 3;
	if (q.length >= 3 && n.includes(q)) return 4;
	return 9;
}

export function mergePlaceHits(
	query: string,
	modern: PlaceHit[],
	pleiades: PlaceHit[],
	limit = 10,
): PlaceHit[] {
	const rank = (h: PlaceHit): [number, number, number, string] => {
		const match = labelMatchRank(query, h.label);
		let kindBoost = 3;
		if (h.kind === "country") kindBoost = 0;
		else if (h.kind === "admin") kindBoost = 1;
		else if (h.kind === "ancient") kindBoost = match <= 1 ? 1 : 2;
		else if (h.kind === "place") kindBoost = 2;
		return [match, kindBoost, h.label.length, h.label.toLowerCase()];
	};

	const seen = new Set<string>();
	const mixed: PlaceHit[] = [];
	for (const h of [...modern, ...pleiades]) {
		if (seen.has(h.id)) continue;
		seen.add(h.id);
		mixed.push(h);
	}
	mixed.sort((a, b) => {
		const ra = rank(a);
		const rb = rank(b);
		for (let i = 0; i < ra.length; i++) {
			if (ra[i]! < rb[i]!) return -1;
			if (ra[i]! > rb[i]!) return 1;
		}
		return 0;
	});
	return mixed.slice(0, limit);
}

export function parseBBoxFromHit(h: PlaceHit): SearchBBox | null {
	if (h.geom.type !== "bbox") return null;
	return parseBBox(`${h.geom.west},${h.geom.south},${h.geom.east},${h.geom.north}`);
}
