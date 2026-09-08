/** Layer / artefact typeahead when the omnibox is scoped to one project. */

import { displayLayerName } from "./queryTokens";

export type LayerHit = {
	name: string;
	label: string;
	detail: string;
	count?: number;
};

export type ArtefactHit = {
	hash: string;
	label: string;
	detail: string;
	mediaType: string;
};

export type EntityHit = {
	layer: string;
	id: string;
	label: string;
	detail: string;
};

export type ValueHit = {
	layer: string;
	id: string;
	column: string;
	match: string;
	label: string;
	detail: string;
};

export type ColumnHit = {
	name: string;
	label: string;
	detail: string;
};

type MediaEntity = { entity_type?: string; entity_id?: string };
type MediaRow = {
	hash?: string;
	media_type?: string;
	profile?: string;
	entities?: MediaEntity[];
};

const LAYER_LIMIT = 4;
const ARTEFACT_LIMIT = 4;
const ENTITY_LIMIT = 8;
const VALUE_LIMIT = 6;
const COLUMN_LIMIT = 12;

const SKIP_COL = /^(geom|geometry|shape|icon|url|href)$/i;
const SKIP_COL_SUFFIX = /_(url|uri|geom|geometry)$/i;

type CachedEntityIndex = { layer: string; id: string }[];
const entityIndexCache = new Map<
	string,
	Promise<CachedEntityIndex>
>();

function authHeaders(token?: string | null): HeadersInit {
	return token ? { Authorization: `Bearer ${token}` } : {};
}

function matches(hay: string, q: string): boolean {
	const h = hay.toLowerCase();
	if (h === q) return true;
	if (h.startsWith(q)) return true;
	if (h.includes(q)) return true;
	return h.replace(/[_-]+/g, " ").includes(q);
}

function artefactKind(mediaType: string): string {
	const t = mediaType.toLowerCase();
	if (t.startsWith("image/")) return "image";
	if (t.startsWith("video/")) return "video";
	if (t.includes("gltf") || t.includes("model")) return "3D model";
	if (t === "application/pdf") return "PDF";
	return mediaType || "artefact";
}

export async function searchProjectLayers(
	slug: string,
	q: string,
	opts?: {
		accessToken?: string | null;
		limit?: number;
		/** Default 2. Use 0 to list layers for `/layer:`. */
		minLength?: number;
		layer?: string | null;
	},
): Promise<LayerHit[]> {
	const prefix = q.trim().toLowerCase();
	const min = opts?.minLength ?? 2;
	if (!slug || prefix.length < min) return [];
	const res = await fetch(`/api/v1/projects/${encodeURIComponent(slug)}/tables`, {
		headers: authHeaders(opts?.accessToken),
	});
	if (!res.ok) return [];
	const data = (await res.json()) as { tables?: Record<string, unknown> };
	const names = Object.keys(data.tables ?? {});
	const only = opts?.layer?.trim().toLowerCase() ?? "";
	const out: LayerHit[] = [];
	for (const name of names) {
		if (only && name.toLowerCase() !== only) continue;
		const label = displayLayerName(name);
		if (prefix && !matches(name, prefix) && !matches(label, prefix)) continue;
		out.push({
			name,
			label,
			detail: "layer",
		});
		if (out.length >= (opts?.limit ?? LAYER_LIMIT)) break;
	}
	return out;
}

export async function searchProjectArtefacts(
	slug: string,
	q: string,
	opts?: {
		accessToken?: string | null;
		limit?: number;
		minLength?: number;
		layer?: string | null;
	},
): Promise<ArtefactHit[]> {
	const prefix = q.trim().toLowerCase();
	const min = opts?.minLength ?? 2;
	if (!slug || prefix.length < min) return [];
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/media?limit=80`,
		{ headers: authHeaders(opts?.accessToken) },
	);
	if (!res.ok) return [];
	const data = (await res.json()) as { items?: MediaRow[] } | MediaRow[];
	const rows = Array.isArray(data) ? data : (data.items ?? []);
	const out: ArtefactHit[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const hash = row.hash?.trim();
		if (!hash || seen.has(hash)) continue;
		const mediaType = row.media_type ?? "";
		const entities = row.entities ?? [];
		const entityBits = entities
			.map((e) => `${e.entity_type ?? ""} ${e.entity_id ?? ""}`)
			.join(" ");
		const hay = `${hash} ${mediaType} ${row.profile ?? ""} ${entityBits}`;
		if (!matches(hay, prefix) && !entities.some((e) =>
			matches(e.entity_type ?? "", prefix) ||
			matches(e.entity_id ?? "", prefix),
		)) {
			continue;
		}
		seen.add(hash);
		const only = opts?.layer?.trim().toLowerCase() ?? "";
		if (
			only &&
			!entities.some((e) => (e.entity_type ?? "").toLowerCase() === only)
		) {
			continue;
		}
		const first =
			(only
				? entities.find(
						(e) => (e.entity_type ?? "").toLowerCase() === only,
					)
				: entities[0]) ?? entities[0];
		const kind = artefactKind(mediaType);
		const detail = first?.entity_id
			? `${kind} · ${first.entity_type ?? "entity"} ${first.entity_id}`
			: kind;
		out.push({
			hash,
			label: first?.entity_id
				? `${first.entity_type ?? "artefact"} ${first.entity_id}`
				: hash.slice(0, 10),
			detail,
			mediaType,
		});
		if (out.length >= (opts?.limit ?? ARTEFACT_LIMIT)) break;
	}
	return out;
}

export async function searchProjectScope(
	slug: string,
	q: string,
	opts?: { accessToken?: string | null; layer?: string | null },
): Promise<{
	layers: LayerHit[];
	artefacts: ArtefactHit[];
	values: ValueHit[];
}> {
	const [layers, artefacts, values] = await Promise.all([
		searchProjectLayers(slug, q, opts),
		searchProjectArtefacts(slug, q, opts),
		searchProjectValues(slug, q, opts),
	]);
	return { layers, artefacts, values };
}

type EntitySearchRow = {
	entity_type?: string;
	entity_id?: string;
	column_name?: string;
	match_value?: string;
};

function clipMatch(raw: string, max = 72): string {
	const s = raw.replace(/\s+/g, " ").trim();
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

function displayColumnName(name: string): string {
	return name.replace(/_/g, " ");
}

/** Cell/attribute hits via `GET …/search-entities` (text-ish columns). */
export async function searchProjectValues(
	slug: string,
	q: string,
	opts?: { accessToken?: string | null; limit?: number; layer?: string | null },
): Promise<ValueHit[]> {
	const prefix = q.trim();
	if (!slug || prefix.length < 2) return [];
	const qs = new URLSearchParams({
		q: prefix,
		limit: "40",
	});
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/search-entities?${qs}`,
		{ headers: authHeaders(opts?.accessToken) },
	);
	if (!res.ok) return [];
	const rows = (await res.json()) as EntitySearchRow[];
	if (!Array.isArray(rows)) return [];
	const lower = prefix.toLowerCase();
	const seen = new Set<string>();
	const prefixed: ValueHit[] = [];
	const rest: ValueHit[] = [];
	const limit = opts?.limit ?? VALUE_LIMIT;
	for (const row of rows) {
		const layer = (row.entity_type ?? "").trim();
		const id = (row.entity_id ?? "").trim();
		const column = (row.column_name ?? "").trim();
		const match = (row.match_value ?? "").trim();
		if (!layer || !id || !match) continue;
		const only = opts?.layer?.trim().toLowerCase() ?? "";
		if (only && layer.toLowerCase() !== only) continue;
		const key = `${layer}:${id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const hit: ValueHit = {
			layer,
			id,
			column,
			match,
			label: clipMatch(match),
			detail: `${displayLayerName(layer)} · ${displayColumnName(column) || "value"} · ${id}`,
		};
		if (match.toLowerCase().startsWith(lower)) prefixed.push(hit);
		else rest.push(hit);
		if (prefixed.length >= limit) break;
	}
	return [...prefixed, ...rest].slice(0, limit);
}

/** Column names for `/row:` typeahead. Prefer `layer` when set. */
export async function listProjectColumns(
	slug: string,
	q: string,
	opts?: {
		accessToken?: string | null;
		limit?: number;
		layer?: string | null;
	},
): Promise<ColumnHit[]> {
	if (!slug) return [];
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/tables`,
		{ headers: authHeaders(opts?.accessToken) },
	);
	if (!res.ok) return [];
	const data = (await res.json()) as { tables?: Record<string, string[]> };
	const tables = data.tables ?? {};
	const only = opts?.layer?.trim().toLowerCase() ?? "";
	const names = Object.keys(tables);
	const order = only
		? names.filter((n) => n.toLowerCase() === only)
		: names;
	const prefix = q.trim().toLowerCase();
	const seen = new Set<string>();
	const out: ColumnHit[] = [];
	const limit = opts?.limit ?? COLUMN_LIMIT;
	for (const table of order) {
		for (const col of tables[table] ?? []) {
			if (SKIP_COL.test(col) || SKIP_COL_SUFFIX.test(col)) continue;
			const key = col.toLowerCase();
			if (seen.has(key)) continue;
			const label = displayLayerName(col);
			if (
				prefix &&
				!matches(col, prefix) &&
				!matches(label, prefix)
			) {
				continue;
			}
			seen.add(key);
			out.push({
				name: col,
				label,
				detail: only ? "column" : displayLayerName(table),
			});
			if (out.length >= limit) return out;
		}
	}
	return out;
}

async function loadEntityIndex(
	slug: string,
	token?: string | null,
): Promise<CachedEntityIndex> {
	const key = `${slug}::${token ?? ""}`;
	const hit = entityIndexCache.get(key);
	if (hit) return hit;
	const pending = (async () => {
		const res = await fetch(
			`/api/v1/projects/${encodeURIComponent(slug)}/tables`,
			{ headers: authHeaders(token) },
		);
		if (!res.ok) return [];
		const data = (await res.json()) as { tables?: Record<string, unknown> };
		const names = Object.keys(data.tables ?? {});
		const batches = await Promise.all(
			names.map(async (name) => {
				const rowsRes = await fetch(
					`/api/v1/projects/${encodeURIComponent(slug)}/tables/${encodeURIComponent(name)}/rows`,
					{ headers: authHeaders(token) },
				);
				if (!rowsRes.ok) return [] as CachedEntityIndex;
				const body = (await rowsRes.json()) as {
					rows?: Record<string, unknown>[];
				};
				const out: CachedEntityIndex = [];
				for (const row of body.rows ?? []) {
					const id = String(
						row.source_id ?? row.SOURCE_ID ?? "",
					).trim();
					if (id) out.push({ layer: name, id });
				}
				return out;
			}),
		);
		return batches.flat();
	})();
	entityIndexCache.set(key, pending);
	pending.catch(() => entityIndexCache.delete(key));
	return pending;
}

/** Prefix/substring match on `source_id` within one project. */
export async function searchProjectEntities(
	slug: string,
	q: string,
	opts?: { accessToken?: string | null; limit?: number; layer?: string | null },
): Promise<EntityHit[]> {
	const prefix = q.trim().toLowerCase();
	if (!slug || prefix.length < 1) return [];
	const index = await loadEntityIndex(slug, opts?.accessToken);
	const limit = opts?.limit ?? ENTITY_LIMIT;
	const prefixed: EntityHit[] = [];
	const rest: EntityHit[] = [];
	const only = opts?.layer?.trim().toLowerCase() ?? "";
	for (const row of index) {
		if (only && row.layer.toLowerCase() !== only) continue;
		const id = row.id.toLowerCase();
		const hit: EntityHit = {
			layer: row.layer,
			id: row.id,
			label: row.id,
			detail: displayLayerName(row.layer),
		};
		if (id.startsWith(prefix) || id === prefix) prefixed.push(hit);
		else if (matches(row.id, prefix)) rest.push(hit);
		if (prefixed.length >= limit) break;
	}
	return [...prefixed, ...rest].slice(0, limit);
}
