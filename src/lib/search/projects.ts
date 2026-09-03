/** Project rows for the SearchComposer omnibox (not PlaceHit). */

import { formatBBox, type SearchBBox } from "./params";
import { searchMergedPlaces } from "./photon";
import type { PlaceHit } from "./placeHit";

export type ProjectHit = {
	slug: string;
	title: string;
	detail: string;
	via: "name" | "geo";
	placeLabel?: string;
};

type SearchApiRow = {
	slug?: string;
	title?: string;
};

const NAME_LIMIT = 4;
const GEO_LIMIT = 3;

function authHeaders(token?: string | null): HeadersInit {
	return token ? { Authorization: `Bearer ${token}` } : {};
}

function rowToHit(
	row: SearchApiRow,
	via: "name" | "geo",
	placeLabel?: string,
): ProjectHit | null {
	const slug = row.slug?.trim();
	const title = row.title?.trim();
	if (!slug || !title) return null;
	const detail =
		via === "geo" && placeLabel
			? `in ${placeLabel}`
			: slug;
	return { slug, title, detail, via, placeLabel };
}

function takeHits(
	rows: unknown,
	via: "name" | "geo",
	limit: number,
	placeLabel?: string,
): ProjectHit[] {
	if (!Array.isArray(rows)) return [];
	const out: ProjectHit[] = [];
	const seen = new Set<string>();
	for (const row of rows as SearchApiRow[]) {
		const hit = rowToHit(row, via, placeLabel);
		if (!hit || seen.has(hit.slug)) continue;
		seen.add(hit.slug);
		out.push(hit);
		if (out.length >= limit) break;
	}
	return out;
}

/** Title/desc/readme/tags via existing Search; semantic off for typeahead. */
export async function searchProjectsByText(
	q: string,
	opts?: { accessToken?: string | null; limit?: number },
): Promise<ProjectHit[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const params = new URLSearchParams({ q: prefix, semantic: "0" });
	const res = await fetch(`/api/v1/search?${params}`, {
		headers: authHeaders(opts?.accessToken),
	});
	if (!res.ok) return [];
	return takeHits(await res.json(), "name", opts?.limit ?? NAME_LIMIT);
}

/** Projects whose bbox or entity geom intersects a gazetteer bbox. */
export async function searchProjectsByBBox(
	bbox: SearchBBox,
	opts?: { accessToken?: string | null; limit?: number; placeLabel?: string },
): Promise<ProjectHit[]> {
	const params = new URLSearchParams({
		bbox: formatBBox(bbox),
		semantic: "0",
	});
	const res = await fetch(`/api/v1/search?${params}`, {
		headers: authHeaders(opts?.accessToken),
	});
	if (!res.ok) return [];
	return takeHits(
		await res.json(),
		"geo",
		opts?.limit ?? GEO_LIMIT,
		opts?.placeLabel,
	);
}

/**
 * Country/admin prefix or exact hit whose bbox can suggest overlapping projects.
 * Membership is ACL on the search API, not a ranking signal here.
 */
export function geoAnchorPlace(
	q: string,
	places: PlaceHit[],
): PlaceHit | null {
	const nq = q.trim().toLowerCase();
	if (nq.length < 2) return null;
	for (const p of places) {
		if (p.kind !== "country" && p.kind !== "admin") continue;
		if (p.geom.type !== "bbox") continue;
		const label = p.label.toLowerCase();
		if (
			label === nq ||
			label.startsWith(nq) ||
			label.split(/[\s,/]+/).some((w) => w.startsWith(nq))
		) {
			return p;
		}
	}
	return null;
}

export function mergeProjectHits(
	named: ProjectHit[],
	geo: ProjectHit[],
): ProjectHit[] {
	const seen = new Set<string>();
	const out: ProjectHit[] = [];
	for (const h of [...named, ...geo]) {
		if (seen.has(h.slug)) continue;
		seen.add(h.slug);
		out.push(h);
	}
	return out;
}

export async function searchOmnibox(
	q: string,
	opts?: {
		accessToken?: string | null;
		projectsOnly?: boolean;
		placesOnly?: boolean;
	},
): Promise<{ places: PlaceHit[]; projects: ProjectHit[] }> {
	const prefix = q.trim();
	if (prefix.length < 2) return { places: [], projects: [] };

	if (opts?.placesOnly) {
		return { places: await searchMergedPlaces(prefix, 10), projects: [] };
	}

	if (opts?.projectsOnly) {
		return {
			places: [],
			projects: await searchProjectsByText(prefix, {
				accessToken: opts.accessToken,
			}),
		};
	}

	const [placesSettled, namedSettled] = await Promise.allSettled([
		searchMergedPlaces(prefix, 10),
		searchProjectsByText(prefix, { accessToken: opts?.accessToken }),
	]);
	const places =
		placesSettled.status === "fulfilled" ? placesSettled.value : [];
	const named =
		namedSettled.status === "fulfilled" ? namedSettled.value : [];

	const anchor = geoAnchorPlace(prefix, places);
	let geo: ProjectHit[] = [];
	if (anchor && anchor.geom.type === "bbox") {
		try {
			geo = await searchProjectsByBBox(
				{
					west: anchor.geom.west,
					south: anchor.geom.south,
					east: anchor.geom.east,
					north: anchor.geom.north,
				},
				{
					accessToken: opts?.accessToken,
					placeLabel: anchor.label,
				},
			);
		} catch {
			geo = [];
		}
	}

	return { places, projects: mergeProjectHits(named, geo) };
}
