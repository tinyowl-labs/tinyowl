import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { searchCities } from "$lib/search/geonamesIndex.server";
import { searchCountries } from "$lib/search/countriesIndex.server";
import { mergePlaceHits, type PlaceHit } from "$lib/search/placeHit";

export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get("q") ?? "").trim();
	const limit = Math.min(
		16,
		Math.max(1, Number(url.searchParams.get("limit") ?? 8) || 8),
	);
	if (q.length < 2) return json({ places: [] as PlaceHit[] });
	const countries = searchCountries(q, 10);
	const cities = searchCities(q, 10);
	return json({
		places: mergePlaceHits(q, [...countries, ...cities], [], limit),
	});
};
