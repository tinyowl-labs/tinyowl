/** Photon (Komoot) typeahead via the server proxy. */

import { mergePlaceHits, pleiadesToHit, type PlaceHit } from "./placeHit";
import { searchPleiadesPlaces } from "./pleiades";

export async function searchPhotonPlaces(
	q: string,
	limit = 5,
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

export async function searchMergedPlaces(
	q: string,
	limit = 10,
): Promise<PlaceHit[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const [photonSettled, pleiadesSettled] = await Promise.allSettled([
		searchPhotonPlaces(prefix, 5),
		searchPleiadesPlaces(prefix, 5),
	]);
	const photon =
		photonSettled.status === "fulfilled" ? photonSettled.value : [];
	const pleiades =
		pleiadesSettled.status === "fulfilled"
			? pleiadesSettled.value.map(pleiadesToHit)
			: [];
	return mergePlaceHits(prefix, photon, pleiades, limit);
}
