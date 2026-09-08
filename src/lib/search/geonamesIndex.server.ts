/**
 * GeoNames cities15000 typeahead (CC BY 4.0).
 * Rebuild: `pnpm gazetteer:index` from tinyowl/.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DEFAULT_SEARCH_RADIUS } from "./params";
import { fold } from "./pleiadesIndex.server";
import { labelMatchRank, type PlaceHit } from "./placeHit";

export type CityRecord = {
	id: string;
	title: string;
	names: string[];
	lat: number;
	lng: number;
	cc: string;
	pop?: number;
};

type IndexFile = { cities: CityRecord[] };

type Prepared = CityRecord & {
	foldedNames: string[];
	foldedTitle: string;
};

const INDEX_NAME = "geonames-cities15000.json.gz";

let prepared: Prepared[] | null = null;

function nameScore(query: string, foldedName: string): number {
	const s = labelMatchRank(query, foldedName);
	return s >= 9 ? 99 : s;
}

function bestScore(query: string, row: Prepared): number {
	let best = 99;
	for (const n of row.foldedNames) {
		const s = nameScore(query, n);
		if (s < best) best = s;
		if (best === 0) return 0;
	}
	return best;
}

function indexCandidates(): string[] {
	const env = process.env.GEONAMES_CITIES_INDEX_PATH;
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
		join(process.cwd(), "build", INDEX_NAME),
		join(process.cwd(), "build/server", INDEX_NAME),
		join(process.cwd(), ".svelte-kit/output/server", INDEX_NAME),
	];
	return paths.filter((p): p is string => Boolean(p));
}

function loadFromDisk(): Prepared[] | null {
	for (const p of indexCandidates()) {
		if (!existsSync(p)) continue;
		try {
			const body = JSON.parse(
				gunzipSync(readFileSync(p)).toString("utf8"),
			) as IndexFile;
			if (!Array.isArray(body.cities) || body.cities.length === 0) continue;
			return body.cities.map((c) => ({
				...c,
				foldedTitle: fold(c.title),
				foldedNames: c.names.map(fold).filter(Boolean),
			}));
		} catch {
			continue;
		}
	}
	return null;
}

function ensure(): Prepared[] {
	if (prepared) return prepared;
	prepared = loadFromDisk() ?? [];
	return prepared;
}

export function searchCities(q: string, limit = 5): PlaceHit[] {
	const query = fold(q);
	if (query.length < 2) return [];
	const rows = ensure();
	const scored: { score: number; pop: number; titleLen: number; row: Prepared }[] =
		[];
	for (const row of rows) {
		const score = bestScore(query, row);
		if (score >= 99) continue;
		scored.push({
			score,
			pop: row.pop ?? 0,
			titleLen: row.foldedTitle.length,
			row,
		});
	}
	scored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		if (a.pop !== b.pop) return b.pop - a.pop;
		return a.titleLen - b.titleLen;
	});
	const out: PlaceHit[] = [];
	for (const s of scored.slice(0, limit)) {
		out.push({
			id: `geonames:${s.row.id}`,
			source: "geonames",
			kind: "place",
			label: s.row.title,
			detail: `city · ${s.row.cc}`,
			geom: {
				type: "point",
				lat: s.row.lat,
				lng: s.row.lng,
				radius: DEFAULT_SEARCH_RADIUS,
			},
			cc: s.row.cc,
		});
	}
	return out;
}
