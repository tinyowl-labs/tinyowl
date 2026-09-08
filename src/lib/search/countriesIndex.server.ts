/**
 * Natural Earth 50m admin-0 countries (public domain).
 * Rebuild: `pnpm gazetteer:index` from tinyowl/.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { fold } from "./pleiadesIndex.server";
import { labelMatchRank, type PlaceHit } from "./placeHit";
import {
	parseBBox,
	type SearchBBox,
} from "./params";

export type CountryRecord = {
	cc: string;
	title: string;
	names: string[];
	bbox: number[];
	geom: { type: string; coordinates: unknown };
};

type IndexFile = {
	countries: CountryRecord[];
};

type Prepared = CountryRecord & {
	foldedNames: string[];
	foldedTitle: string;
};

const INDEX_NAME = "ne-countries-50m.json.gz";

let prepared: Prepared[] | null = null;
let byCC: Map<string, Prepared> | null = null;

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
	const env = process.env.NE_COUNTRIES_INDEX_PATH;
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
			if (!Array.isArray(body.countries) || body.countries.length === 0) {
				continue;
			}
			return body.countries.map((c) => ({
				...c,
				cc: c.cc.toUpperCase(),
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
	byCC = new Map(prepared.map((c) => [c.cc, c]));
	return prepared;
}

export function lookupCountry(cc: string): CountryRecord | null {
	ensure();
	const row = byCC?.get(cc.trim().toUpperCase());
	return row ?? null;
}

export function countryBBox(row: CountryRecord): SearchBBox | null {
	if (!Array.isArray(row.bbox) || row.bbox.length < 4) return null;
	return parseBBox(row.bbox.join(","));
}

export function countryToHit(row: CountryRecord): PlaceHit | null {
	const box = countryBBox(row);
	if (!box) return null;
	return {
		id: `ne:${row.cc}`,
		source: "naturalearth",
		kind: "country",
		label: row.title,
		detail: `country · ${row.cc}`,
		geom: { type: "bbox", ...box },
		cc: row.cc,
	};
}

export function searchCountries(q: string, limit = 5): PlaceHit[] {
	const query = fold(q);
	if (query.length < 2) return [];
	const rows = ensure();
	const scored: { score: number; titleLen: number; row: Prepared }[] = [];
	for (const row of rows) {
		const score = bestScore(query, row);
		if (score >= 99) continue;
		scored.push({ score, titleLen: row.foldedTitle.length, row });
	}
	scored.sort((a, b) => {
		if (a.score !== b.score) return a.score - b.score;
		if (a.titleLen !== b.titleLen) return a.titleLen - b.titleLen;
		return a.row.foldedTitle.localeCompare(b.row.foldedTitle);
	});
	const out: PlaceHit[] = [];
	for (const s of scored) {
		const hit = countryToHit(s.row);
		if (hit) out.push(hit);
		if (out.length >= limit) break;
	}
	return out;
}
