import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { lookupCountry, countryBBox } from "$lib/search/countriesIndex.server";

export const GET: RequestHandler = async ({ url }) => {
	const cc = (url.searchParams.get("cc") ?? "").trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(cc)) {
		error(400, "cc required");
	}
	const row = lookupCountry(cc);
	if (!row) error(404, "unknown country");
	const bbox = countryBBox(row);
	if (!bbox) error(404, "unknown country");
	return json({
		cc: row.cc,
		label: row.title,
		bbox,
		geometry: row.geom,
	});
};
