/** Modern gazetteer (Natural Earth + GeoNames) + Pleiades merge. */

import { mergePlaceHits, pleiadesToHit, type PlaceHit } from "./placeHit";
import { searchPleiadesPlaces } from "./pleiades";

export async function searchGazetteerPlaces(
	q: string,
	limit = 8,
): Promise<PlaceHit[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const res = await fetch(
		`/api/geocode/search?q=${encodeURIComponent(prefix)}&limit=${limit}`,
	);
	if (!res.ok) return [];
	const data = (await res.json()) as { places?: PlaceHit[] };
	return data.places ?? [];
}

export async function searchPleiadesHits(
	q: string,
	limit = 5,
): Promise<PlaceHit[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const rows = await searchPleiadesPlaces(prefix, limit);
	return rows.map(pleiadesToHit);
}

export async function searchMergedPlaces(
	q: string,
	limit = 10,
): Promise<PlaceHit[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const [modernSettled, pleiadesSettled] = await Promise.allSettled([
		searchGazetteerPlaces(prefix, 16),
		searchPleiadesHits(prefix, 8),
	]);
	const modern =
		modernSettled.status === "fulfilled" ? modernSettled.value : [];
	const pleiades =
		pleiadesSettled.status === "fulfilled" ? pleiadesSettled.value : [];
	return mergePlaceHits(prefix, modern, pleiades, limit);
}

export type CountryOutline = {
	cc: string;
	label: string;
	bbox: { west: number; south: number; east: number; north: number };
	geometry: { type: string; coordinates: unknown };
};

const outlineInflight = new Map<string, Promise<CountryOutline | null>>();

export async function fetchCountryOutline(
	cc: string,
): Promise<CountryOutline | null> {
	const code = cc.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(code)) return null;
	const pending = outlineInflight.get(code);
	if (pending) return pending;
	const req = (async () => {
		try {
			const res = await fetch(
				`/api/geocode/country?cc=${encodeURIComponent(code)}`,
			);
			if (!res.ok) {
				outlineInflight.delete(code);
				return null;
			}
			return (await res.json()) as CountryOutline;
		} catch {
			outlineInflight.delete(code);
			return null;
		}
	})();
	outlineInflight.set(code, req);
	return req;
}
