/** Pleiades gazetteer hits used by search typeahead. */

export type PleiadesPlace = {
	id: string;
	title: string;
	description: string;
	lat: number;
	lng: number;
	/** Suggested search radius in metres from the place envelope. */
	radius: number;
	uri: string;
	types: string[];
};

export async function searchPleiadesPlaces(
	q: string,
	limit = 8,
): Promise<PleiadesPlace[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const res = await fetch(
		`/api/pleiades/search?q=${encodeURIComponent(prefix)}&limit=${limit}`,
	);
	if (!res.ok) return [];
	const data = (await res.json()) as { places?: PleiadesPlace[] };
	return data.places ?? [];
}
