/** Unified omnibox place hit (Pleiades + Photon). */

import {
	DEFAULT_SEARCH_RADIUS,
	parseBBox,
	type SearchBBox,
} from "./params";
import type { PleiadesPlace } from "./pleiades";

export type PlaceKind = "country" | "admin" | "ancient" | "place";
export type PlaceSource = "pleiades" | "photon";

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
	osm?: { type: "N" | "W" | "R"; id: number };
};

export function bboxFromPhotonExtent(
	extent: unknown,
): SearchBBox | null {
	if (!Array.isArray(extent) || extent.length < 4) return null;
	const nums = extent.slice(0, 4).map(Number);
	if (nums.some((n) => !Number.isFinite(n))) return null;
	const [a, b, c, d] = nums as [number, number, number, number];
	const west = Math.min(a, c);
	const east = Math.max(a, c);
	const south = Math.min(b, d);
	const north = Math.max(b, d);
	return parseBBox(`${west},${south},${east},${north}`);
}

function haversineMetres(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const x =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

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

export function photonKind(
	type: string | undefined,
	osmValue: string | undefined,
): PlaceKind | null {
	const t = (type || osmValue || "").toLowerCase();
	if (t === "country") return "country";
	if (t === "state" || t === "county") return "admin";
	if (
		t === "city" ||
		t === "locality" ||
		t === "district" ||
		t === "town" ||
		t === "village" ||
		t === "municipality"
	) {
		return "place";
	}
	return null;
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

export function mergePlaceHits(
	query: string,
	photon: PlaceHit[],
	pleiades: PlaceHit[],
	limit = 10,
): PlaceHit[] {
	const q = query.trim().toLowerCase();
	const short = q.split(/\s+/).filter(Boolean).length <= 2;

	const rank = (h: PlaceHit): [number, number, number, string] => {
		const label = h.label.toLowerCase();
		let match = 5;
		if (label === q) match = 0;
		else if (label.startsWith(q)) match = 1;
		else if (label.split(/[\s,/]+/).some((w) => w.startsWith(q))) match = 2;
		else if (q.length >= 4 && label.includes(q)) match = 3;

		let kindBoost = 3;
		if (h.kind === "country") kindBoost = 0;
		else if (h.kind === "admin") kindBoost = 1;
		else if (h.kind === "ancient") kindBoost = match <= 1 ? 1 : 2;
		if (!short && h.kind === "place") kindBoost = 3;
		return [match, kindBoost, label.length, label];
	};

	const mixed = [...photon.slice(0, 5), ...pleiades.slice(0, 5)];
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
