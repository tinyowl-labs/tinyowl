import type { PlaceHit } from "./placeHit";

/** Catalog hits from GET /api/v1/terms (PeriodO, AAT, FISH, CGI lithology, soil colour). */

export type TermHit = {
	id: string;
	label: string;
	uri: string;
	scheme: string;
	kind: string;
	score: number;
	context?: string;
	spatial?: string;
	start_year?: number;
	end_year?: number;
	hub_uri?: string;
};

export type TermRef = {
	uri: string;
	label?: string;
	scheme?: string;
};

export type TermMember = {
	uri: string;
	label: string;
	spatial?: string;
	start_year?: number;
	end_year?: number;
};

/** Typed context from GET /api/v1/terms/inspect?uri= */
export type TermInspectDoc = {
	id: string;
	label: string;
	uri: string;
	scheme: string;
	kind: string;
	context?: string;
	scope_note?: string;
	alt_labels?: string[];
	broader?: TermRef[];
	narrower?: TermRef[];
	clique: TermRef[];
	close_match?: TermRef[];
	broad_match?: TermRef[];
	members?: TermMember[];
	spatial?: string;
	start_year?: number;
	end_year?: number;
	hub?: string;
	provenance: string;
};

export async function searchTerms(
	q: string,
	opts?: { kind?: string; limit?: number; signal?: AbortSignal },
): Promise<TermHit[]> {
	const prefix = q.trim();
	if (prefix.length < 2) return [];
	const params = new URLSearchParams({ q: prefix });
	if (opts?.kind) params.set("kind", opts.kind);
	params.set("limit", String(opts?.limit ?? 8));
	const res = await fetch(`/api/v1/terms?${params}`, { signal: opts?.signal });
	if (res.status === 503) return [];
	if (!res.ok) return [];
	const data = (await res.json()) as TermHit[] | null;
	return Array.isArray(data) ? data : [];
}

function normalizeTermText(value: string): string {
	return value
		.normalize("NFKD")
		.toLocaleLowerCase()
		.replace(/\p{M}+/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/** Gazetteer labels to use when ranking a regional PeriodO definition. */
export function periodPlaceContexts(
	place: Pick<PlaceHit, "label" | "cc">,
): string[] {
	const values = [place.label.trim()];
	const cc = place.cc?.trim().toUpperCase();
	if (cc) {
		try {
			const region = new Intl.DisplayNames(["en"], { type: "region" }).of(cc);
			if (region) values.push(region);
		} catch {
			// The primary gazetteer label remains useful on older runtimes.
		}
	}
	return [...new Set(values.filter(Boolean))];
}

/**
 * Select an exact PeriodO label only when its regional meaning is unambiguous.
 * API order remains the tie-breaker after spatial context has been checked.
 */
export function selectContextualPeriod(
	hits: TermHit[],
	label: string,
	placeContexts: string[] = [],
): TermHit | null {
	const wanted = normalizeTermText(label);
	if (!wanted) return null;
	const seen = new Set<string>();
	const exact = hits.filter((hit) => {
		if (normalizeTermText(hit.label) !== wanted || seen.has(hit.uri)) return false;
		seen.add(hit.uri);
		return true;
	});
	const places = placeContexts.map(normalizeTermText).filter(Boolean);
	if (places.length === 0) return exact.length === 1 ? exact[0]! : null;
	return exact.find((hit) => {
		const spatial = normalizeTermText(hit.spatial ?? "");
		return Boolean(spatial) && places.some((place) => spatial.includes(place) || place.includes(spatial));
	}) ?? null;
}

export async function inspectTerm(
	uri: string,
	opts?: { signal?: AbortSignal },
): Promise<TermInspectDoc | null> {
	const id = uri.trim();
	if (!id) return null;
	const params = new URLSearchParams({ uri: id });
	const res = await fetch(`/api/v1/terms/inspect?${params}`, {
		signal: opts?.signal,
	});
	if (res.status === 503 || res.status === 404 || !res.ok) return null;
	const data = (await res.json()) as TermInspectDoc | null;
	if (!data || typeof data.uri !== "string") return null;
	return data;
}

export function formatTermYears(hit: {
	start_year?: number;
	end_year?: number;
}): string {
	if (hit.start_year == null && hit.end_year == null) return "";
	if (hit.start_year != null && hit.end_year != null) {
		return `${hit.start_year} – ${hit.end_year}`;
	}
	if (hit.start_year != null) return String(hit.start_year);
	return String(hit.end_year);
}

const BROAD_SPATIAL = new Set([
	"world",
	"earth",
	"global",
	"worldwide",
	"the world",
	"the earth",
]);

/** Leading place name to geocode from PeriodO spatial text. Null if global/empty. */
export function periodSpatialQuery(spatial: string | undefined): string | null {
	const raw = (spatial ?? "").trim();
	if (!raw) return null;
	const first = raw.split(/\s+except\s+|[,;/]/i)[0]?.trim() ?? "";
	if (first.length < 2) return null;
	const key = first.toLowerCase().replace(/^the\s+/, "");
	if (BROAD_SPATIAL.has(key) || BROAD_SPATIAL.has(first.toLowerCase())) {
		return null;
	}
	return first;
}

/** Country/admin bbox only — do not pin a city or Pleiades point for a period region. Country hits carry `cc` for `?cc=` apply. */
export function pickPeriodPlace(
	query: string,
	places: PlaceHit[],
): PlaceHit | null {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	const boxes = places.filter((p) => p.geom.type === "bbox");
	const exact = boxes.find((p) => p.label.toLowerCase() === q);
	if (exact) return exact;
	const country = boxes.find(
		(p) =>
			p.kind === "country" &&
			(p.label.toLowerCase() === q ||
				p.label.toLowerCase().startsWith(q) ||
				q.startsWith(p.label.toLowerCase())),
	);
	return country ?? null;
}
