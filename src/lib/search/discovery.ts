import {
	bboxFromGeoJSON,
	formatDateSpan,
	type SearchBBox,
} from "$lib/search/params";

/** Project row for the spatial discovery canvas (home browse + /search hits). */
export type DiscoveryProject = {
	slug: string;
	title: string;
	description: string | null;
	entity_count: number;
	table_count: number;
	bbox: string | null;
	lat?: number | null;
	lng?: number | null;
	match_detail?: string;
	match_snippet?: string;
	match_hits?: Array<{
		entity_type: string;
		column_name: string;
		local_value: string;
	}>;
	tags_manual?: string[];
	tags_auto?: string[];
	date_start?: number | null;
	date_end?: number | null;
	date_start_label?: string | null;
	date_end_label?: string | null;
	distance_m?: number;
};

export type MapCursor = {
	lat: number | null;
	lng: number | null;
	zoom: number | null;
};

export function projectTags(proj: DiscoveryProject, limit = 8): string[] {
	const manual = proj.tags_manual ?? [];
	const auto = proj.tags_auto ?? [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of [...manual, ...auto]) {
		const key = t.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(t);
		if (out.length >= limit) break;
	}
	return out;
}

export function projectDateLabel(proj: DiscoveryProject): string | null {
	if (proj.date_start_label || proj.date_end_label) {
		const a = proj.date_start_label ?? "";
		const b = proj.date_end_label ?? "";
		if (a && b && a !== b) return `${a} – ${b}`;
		return a || b || null;
	}
	return formatDateSpan(proj.date_start, proj.date_end);
}

export function projectIntersectsBounds(
	p: DiscoveryProject,
	b: SearchBBox,
): boolean {
	const env = p.bbox ? bboxFromGeoJSON(p.bbox) : null;
	if (env) {
		return !(
			env.east < b.west ||
			env.west > b.east ||
			env.north < b.south ||
			env.south > b.north
		);
	}
	if (p.lat != null && p.lng != null) {
		return (
			p.lat >= b.south &&
			p.lat <= b.north &&
			p.lng >= b.west &&
			p.lng <= b.east
		);
	}
	return false;
}

export function projectInTemporalRange(
	p: DiscoveryProject,
	from: number | null,
	to: number | null,
): boolean {
	if (from == null && to == null) return true;
	const start = p.date_start ?? p.date_end;
	const end = p.date_end ?? p.date_start;
	if (start == null || end == null) return false;
	const a = Math.min(start, end);
	const b = Math.max(start, end);
	const lo = from ?? -1e9;
	const hi = to ?? 1e9;
	return a <= hi && b >= lo;
}

export function projectWithinRadius(
	p: DiscoveryProject,
	lat: number,
	lng: number,
	radiusM: number,
): boolean {
	const plat = p.lat;
	const plng = p.lng;
	let lat2 = plat ?? null;
	let lng2 = plng ?? null;
	if ((lat2 == null || lng2 == null) && p.bbox) {
		const env = bboxFromGeoJSON(p.bbox);
		if (env) {
			lat2 = (env.north + env.south) / 2;
			lng2 = (env.east + env.west) / 2;
		}
	}
	if (lat2 == null || lng2 == null) return false;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat);
	const dLng = toRad(lng2 - lng);
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	const metres = 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
	return metres <= radiusM;
}
