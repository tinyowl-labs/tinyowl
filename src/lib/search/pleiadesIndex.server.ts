/**
 * Local Pleiades typeahead index (CC BY 3.0).
 * Rebuild: `pnpm pleiades:index` (python3 scripts/pleiades-index.py) from tinyowl/.
 * Dump: GIS CSV package at https://atlantides.org/downloads/pleiades/gis/
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { PleiadesPlace } from "./pleiades";

export type IndexedPlace = {
	id: string;
	title: string;
	names: string[];
	lat: number;
	lng: number;
	types: string[];
	bbox?: number[];
	description?: string;
};

type IndexFile = {
	source: string;
	license: string;
	attribution: string;
	placeCount: number;
	places: IndexedPlace[];
};

type PreparedPlace = IndexedPlace & {
	foldedNames: string[];
	foldedTitle: string;
};

const PLEIADES_PLACE = "https://pleiades.stoa.org/places";
const INDEX_NAME = "pleiades-index.json.gz";

let prepared: PreparedPlace[] | null = null;
let loggedMissing = false;

export function fold(s: string): string {
	return s
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

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

export function radiusFromBbox(
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

function levenshteinAtMost(a: string, b: string, maxd: number): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > maxd) return maxd + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		let rowMin = i;
		const ca = a.charCodeAt(i - 1);
		for (let j = 1; j <= b.length; j++) {
			const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
			const v = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
			cur.push(v);
			if (v < rowMin) rowMin = v;
		}
		if (rowMin > maxd) return maxd + 1;
		prev = cur;
	}
	return prev[b.length]!;
}

/** Lower is better. 99 = no match. */
function nameScore(query: string, foldedName: string): number {
	if (foldedName === query) return 0;
	if (foldedName.startsWith(query)) return 1;
	if (query.length >= 3) {
		for (const word of foldedName.split(/[\s,;/]+/)) {
			if (word.startsWith(query)) return 2;
		}
	}
	if (query.length >= 4 && foldedName.includes(query)) return 3;
	if (
		query.length >= 4 &&
		foldedName.length <= query.length + 4 &&
		levenshteinAtMost(query, foldedName, 1) <= 1
	) {
		return 4;
	}
	return 99;
}

function bestScore(query: string, place: PreparedPlace): number {
	let best = 99;
	for (const n of place.foldedNames) {
		const s = nameScore(query, n);
		if (s < best) best = s;
		if (best === 0) return 0;
	}
	return best;
}

function toHit(place: PreparedPlace): PleiadesPlace {
	return {
		id: place.id,
		title: place.title,
		description: place.description ?? "",
		lat: place.lat,
		lng: place.lng,
		radius: radiusFromBbox(place.bbox),
		uri: `${PLEIADES_PLACE}/${place.id}`,
		types: place.types,
	};
}

export function searchLocalPlaces(
	places: PreparedPlace[],
	q: string,
	limit: number,
): PleiadesPlace[] {
	const query = fold(q);
	if (query.length < 2) return [];

	if (/^\d{4,}$/.test(query)) {
		const hit = places.find((p) => p.id === query);
		return hit ? [toHit(hit)] : [];
	}

	const scored: { score: number; titleLen: number; title: string; place: PreparedPlace }[] =
		[];
	for (const place of places) {
		const score = bestScore(query, place);
		if (score >= 99) continue;
		scored.push({
			score,
			titleLen: place.foldedTitle.length,
			title: place.foldedTitle,
			place,
		});
	}
	scored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		if (a.titleLen !== b.titleLen) return a.titleLen - b.titleLen;
		return a.title.localeCompare(b.title);
	});
	return scored.slice(0, limit).map((s) => toHit(s.place));
}

function indexCandidates(): string[] {
	const env = process.env.PLEIADES_INDEX_PATH;
	let moduleDir = "";
	try {
		moduleDir = dirname(fileURLToPath(import.meta.url));
	} catch {
		moduleDir = "";
	}
	const paths = [
		env,
		moduleDir ? join(moduleDir, "data", INDEX_NAME) : "",
		join(process.cwd(), "src/lib/search/data", INDEX_NAME),
		join(process.cwd(), INDEX_NAME),
		join(process.cwd(), "server", INDEX_NAME),
		join(process.cwd(), "build", INDEX_NAME),
		join(process.cwd(), "build/server", INDEX_NAME),
	];
	return paths.filter((p): p is string => Boolean(p));
}

function loadFromDisk(): PreparedPlace[] | null {
	for (const p of indexCandidates()) {
		if (!existsSync(p)) continue;
		try {
			const buf = gunzipSync(readFileSync(p));
			const body = JSON.parse(buf.toString("utf8")) as IndexFile;
			if (!Array.isArray(body.places) || body.places.length === 0) continue;
			return body.places.map((place) => ({
				...place,
				foldedTitle: fold(place.title),
				foldedNames: place.names.map(fold).filter(Boolean),
			}));
		} catch {
			continue;
		}
	}
	return null;
}

export function getLocalIndex(): PreparedPlace[] | null {
	if (prepared) return prepared;
	prepared = loadFromDisk();
	if (!prepared && !loggedMissing) {
		loggedMissing = true;
		console.warn(
			"[pleiades] local index missing; falling back to iDAI. Rebuild with `pnpm pleiades:index` or set PLEIADES_INDEX_PATH.",
		);
	}
	return prepared;
}

export function searchIndexedPleiades(
	q: string,
	limit: number,
): PleiadesPlace[] | null {
	const index = getLocalIndex();
	if (!index) return null;
	return searchLocalPlaces(index, q, limit);
}
