/** Schema-driven form / infobox helpers (confirmed FKs + lookup/junction kinds). */

export type LookupOpt = { id: string; label: string };

export type SchemaFieldEdge = {
	source: string;
	target: string;
	source_column: string;
	target_column?: string;
	kind?: string;
	allow_multi?: boolean;
};

export type SchemaTableKind = {
	name: string;
	label?: string;
	kind?: string;
	count?: number;
	columns?: { name: string }[];
};

export function isGeomColumn(name: string): boolean {
	return /^_?geom/i.test(name);
}

export function tableHasGeom(
	columns: string[] | { name: string }[] | undefined,
): boolean {
	if (!columns) return false;
	return columns.some((c) => isGeomColumn(typeof c === "string" ? c : c.name));
}

export function tableKind(t: SchemaTableKind | undefined): string {
	return (t?.kind ?? "").trim().toLowerCase();
}

export function lookupLabel(
	row: Record<string, unknown> | undefined,
	fallback: string,
): string {
	if (!row) return fallback;
	for (const k of ["label", "name", "title", "code", "LABEL", "NAME", "TITLE"]) {
		const v = row[k];
		if (v != null && String(v).trim() !== "") return String(v);
	}
	return fallback;
}

export function fkEdgeForColumn(
	edges: SchemaFieldEdge[],
	table: string,
	column: string,
): SchemaFieldEdge | undefined {
	const t = table.toLowerCase();
	const c = column.toLowerCase();
	return edges.find(
		(e) =>
			(e.kind ?? "fk") === "fk" &&
			e.source.toLowerCase() === t &&
			e.source_column.toLowerCase() === c,
	);
}

export function rowBySourceId(
	rows: Record<string, unknown>[] | undefined,
	id: string,
): Record<string, unknown> | undefined {
	const want = id.trim();
	if (!want) return undefined;
	return (rows ?? []).find((r) => {
		const sid = String(r.source_id ?? r.SOURCE_ID ?? "").trim();
		return sid === want;
	});
}

export function resolveFkDisplay(
	raw: string,
	edge: SchemaFieldEdge | undefined,
	rowsByTable: Record<string, Record<string, unknown>[]>,
): { id: string; label: string; table: string } | null {
	const id = raw.trim();
	if (!id || !edge?.target) return null;
	const row = rowBySourceId(rowsByTable[edge.target], id);
	return { id, label: lookupLabel(row, id), table: edge.target };
}

export function optsFromRows(
	rows: Record<string, unknown>[] | undefined,
): LookupOpt[] {
	return (rows ?? [])
		.map((row) => {
			const id = String(row.source_id ?? row.SOURCE_ID ?? "").trim();
			if (!id) return null;
			return { id, label: lookupLabel(row, id) };
		})
		.filter((o): o is LookupOpt => o != null);
}

export async function loadProjectFkLookups(opts: {
	slug: string;
	accessToken?: string;
	tables: Record<string, string[]>;
}): Promise<Record<string, Record<string, LookupOpt[]>>> {
	const { slug, accessToken = "", tables } = opts;
	if (!slug) return {};
	const headers: Record<string, string> = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/schema`,
		{ headers },
	);
	if (!res.ok) return {};
	const json = (await res.json()) as { edges?: SchemaFieldEdge[] };
	const edges = json.edges ?? [];
	// Cache the in-flight promise, not only the completed value. Several FK
	// columns commonly target the same table and are resolved concurrently.
	const targetCache = new Map<string, Promise<LookupOpt[]>>();
	const loadTarget = async (target: string) => {
		const hit = targetCache.get(target);
		if (hit) return hit;
		const pending = (async () => {
			const rowsRes = await fetch(
				`/api/v1/projects/${encodeURIComponent(slug)}/tables/${encodeURIComponent(target)}/rows`,
				{ headers },
			);
			return rowsRes.ok
				? optsFromRows(
						((await rowsRes.json()) as {
							rows?: Record<string, unknown>[];
						}).rows,
				  )
				: [];
		})();
		targetCache.set(target, pending);
		return pending;
	};
	const out: Record<string, Record<string, LookupOpt[]>> = {};
	await Promise.all(
		Object.keys(tables).map(async (table) => {
			const cols = tables[table] ?? [];
			const byCol: Record<string, LookupOpt[]> = {};
			await Promise.all(
				cols.map(async (name) => {
					const edge = fkEdgeForColumn(edges, table, name);
					if (!edge?.target) return;
					byCol[name] = await loadTarget(edge.target);
				}),
			);
			out[table] = byCol;
		}),
	);
	return out;
}

export async function loadFkLookups(opts: {
	slug: string;
	table: string;
	columns: string[];
	accessToken?: string;
}): Promise<Record<string, LookupOpt[]>> {
	const { slug, table, columns, accessToken = "" } = opts;
	if (!slug || !table || columns.length === 0) return {};
	const headers: Record<string, string> = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	const res = await fetch(
		`/api/v1/projects/${encodeURIComponent(slug)}/schema`,
		{ headers },
	);
	if (!res.ok) return {};
	const json = (await res.json()) as { edges?: SchemaFieldEdge[] };
	const next: Record<string, LookupOpt[]> = {};
	await Promise.all(
		columns.map(async (name) => {
			const edge = fkEdgeForColumn(json.edges ?? [], table, name);
			if (!edge?.target) return;
			const rowsRes = await fetch(
				`/api/v1/projects/${encodeURIComponent(slug)}/tables/${encodeURIComponent(edge.target)}/rows`,
				{ headers },
			);
			if (!rowsRes.ok) return;
			const body = (await rowsRes.json()) as {
				rows?: Record<string, unknown>[];
			};
			next[name] = optsFromRows(body.rows);
		}),
	);
	return next;
}

export type JunctionLink = {
	table: string;
	entityId: string;
	otherTable: string;
	otherId: string;
	otherLabel: string;
};

/** Junction tables that hang off a fact table (`from_id` / `to_id`). */
export function junctionTablesFor(
	factTable: string,
	schemaTables: SchemaTableKind[],
): SchemaTableKind[] {
	const fact = factTable.toLowerCase();
	return schemaTables.filter((t) => {
		if (tableKind(t) !== "junction") return false;
		const prefix = `${fact}_`;
		if (t.name.toLowerCase().startsWith(prefix)) return true;
		const cols = (t.columns ?? []).map((c) => c.name.toLowerCase());
		return cols.includes("from_id") || cols.includes("to_id");
	});
}

export function junctionLinksForEntity(
	factTable: string,
	entityId: string,
	schemaTables: SchemaTableKind[],
	rowsByTable: Record<string, Record<string, unknown>[]>,
): JunctionLink[] {
	const id = entityId.trim();
	if (!id) return [];
	const out: JunctionLink[] = [];
	for (const jt of junctionTablesFor(factTable, schemaTables)) {
		for (const row of rowsByTable[jt.name] ?? []) {
			const sid = String(row.source_id ?? row.SOURCE_ID ?? "").trim();
			const from = String(row.from_id ?? row.FROM_ID ?? "").trim();
			const to = String(row.to_id ?? row.TO_ID ?? "").trim();
			if (!sid) continue;
			let otherId = "";
			if (from === id) otherId = to;
			else if (to === id) otherId = from;
			else continue;
			const otherTable = guessJunctionOtherTable(jt.name, factTable);
			const otherRow = rowBySourceId(rowsByTable[otherTable], otherId);
			out.push({
				table: jt.name,
				entityId: sid,
				otherTable,
				otherId,
				otherLabel: lookupLabel(otherRow, otherId),
			});
		}
	}
	return out;
}

function guessJunctionOtherTable(junctionName: string, factTable: string): string {
	const prefix = `${factTable}_`;
	if (junctionName.toLowerCase().startsWith(prefix.toLowerCase())) {
		return junctionName.slice(prefix.length);
	}
	return junctionName;
}

function guessJunctionFact(
	junctionName: string,
	schemaTables: SchemaTableKind[],
): string {
	const lower = junctionName.toLowerCase();
	for (const t of schemaTables) {
		if (tableKind(t) === "junction") continue;
		if (lower.startsWith(`${t.name.toLowerCase()}_`)) return t.name;
	}
	const i = junctionName.indexOf("_");
	return i > 0 ? junctionName.slice(0, i) : junctionName;
}

function rowValue(
	row: Record<string, unknown> | undefined,
	col: string,
): unknown {
	if (!row || !col) return undefined;
	if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
	const lower = col.toLowerCase();
	for (const [k, v] of Object.entries(row)) {
		if (k.toLowerCase() === lower) return v;
	}
	return undefined;
}

/** Split a confirmed FK / ValueRelation cell into target ids. */
export function cellIds(raw: unknown, allowMulti = false): string[] {
	if (raw == null || raw === "") return [];
	if (Array.isArray(raw)) return raw.flatMap((v) => cellIds(v, true));
	if (typeof raw === "number" || typeof raw === "boolean") return [String(raw)];
	const s = String(raw).trim();
	if (!s) return [];
	if (s.startsWith("[")) {
		try {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed)) return cellIds(parsed, true);
		} catch {
			/* fall through */
		}
	}
	const wrapped = s.startsWith("{") && s.endsWith("}") && !s.startsWith('{"');
	if (allowMulti || wrapped || s.includes(",") || s.includes(";")) {
		const inner = wrapped ? s.slice(1, -1) : s;
		return inner
			.split(/[,;]/)
			.map((t) => t.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	return [s];
}

export type EntityHop = {
	key: string;
	dir: "out" | "in";
	kind: "fk" | "junction";
	via: string;
	table: string;
	id: string;
	label: string;
};

const HOP_IN_CAP = 24;

/** One-hop FKs + junctions around an entity (not `_relations` / instance graph). */
export function hopsForEntity(opts: {
	table: string;
	entityId: string;
	attributes?: Record<string, string>;
	schemaEdges: SchemaFieldEdge[];
	schemaTables: SchemaTableKind[];
	rowsByTable: Record<string, Record<string, unknown>[]>;
}): EntityHop[] {
	const table = opts.table.trim();
	const entityId = opts.entityId.trim();
	if (!table || !entityId) return [];
	const out: EntityHop[] = [];
	const seen = new Set<string>();
	const push = (hop: Omit<EntityHop, "key">) => {
		if (!hop.table || !hop.id) return;
		if (
			hop.id === entityId &&
			hop.table.toLowerCase() === table.toLowerCase()
		) {
			return;
		}
		const key = `${hop.dir}:${hop.kind}:${hop.table}:${hop.id}:${hop.via}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({ ...hop, key });
	};

	const selfRow =
		rowBySourceId(opts.rowsByTable[table], entityId) ??
		(opts.attributes as Record<string, unknown> | undefined);

	for (const e of opts.schemaEdges) {
		if ((e.kind ?? "fk") !== "fk") continue;
		if (e.source.toLowerCase() !== table.toLowerCase()) continue;
		const raw = selfRow
			? rowValue(selfRow, e.source_column)
			: opts.attributes?.[e.source_column];
		for (const id of cellIds(raw, Boolean(e.allow_multi))) {
			const disp = resolveFkDisplay(id, e, opts.rowsByTable);
			push({
				dir: "out",
				kind: "fk",
				via: e.source_column,
				table: e.target,
				id,
				label: disp?.label ?? id,
			});
		}
	}

	for (const jt of opts.schemaTables) {
		if (tableKind(jt) !== "junction") continue;
		const fact = guessJunctionFact(jt.name, opts.schemaTables);
		const other = guessJunctionOtherTable(jt.name, fact);
		for (const row of opts.rowsByTable[jt.name] ?? []) {
			const from = String(row.from_id ?? row.FROM_ID ?? "").trim();
			const to = String(row.to_id ?? row.TO_ID ?? "").trim();
			if (from === entityId) {
				const otherRow = rowBySourceId(opts.rowsByTable[other], to);
				push({
					dir: "out",
					kind: "junction",
					via: jt.name,
					table: other,
					id: to,
					label: lookupLabel(otherRow, to),
				});
			} else if (to === entityId) {
				const otherRow = rowBySourceId(opts.rowsByTable[fact], from);
				push({
					dir: "in",
					kind: "junction",
					via: jt.name,
					table: fact,
					id: from,
					label: lookupLabel(otherRow, from),
				});
			}
		}
	}

	let inbound = 0;
	for (const e of opts.schemaEdges) {
		if (inbound >= HOP_IN_CAP) break;
		if ((e.kind ?? "fk") !== "fk") continue;
		if (e.target.toLowerCase() !== table.toLowerCase()) continue;
		if (e.source.toLowerCase() === table.toLowerCase()) continue;
		for (const row of opts.rowsByTable[e.source] ?? []) {
			if (inbound >= HOP_IN_CAP) break;
			const sid = String(row.source_id ?? row.SOURCE_ID ?? "").trim();
			if (!sid) continue;
			const ids = cellIds(rowValue(row, e.source_column), Boolean(e.allow_multi));
			if (!ids.includes(entityId)) continue;
			push({
				dir: "in",
				kind: "fk",
				via: e.source_column,
				table: e.source,
				id: sid,
				label: lookupLabel(row, sid),
			});
			inbound += 1;
		}
	}

	return out;
}

export function hopsByDir(hops: EntityHop[]): {
	out: EntityHop[];
	in: EntityHop[];
} {
	return {
		out: hops.filter((h) => h.dir === "out"),
		in: hops.filter((h) => h.dir === "in"),
	};
}

export type AttrTableGroup = {
	key: "lookup" | "junction" | "attribute";
	label: string;
	tables: SchemaTableKind[];
};

export function groupNonGeomTables(
	schemaTables: SchemaTableKind[],
	geomNames: Set<string>,
): AttrTableGroup[] {
	const lookups: SchemaTableKind[] = [];
	const links: SchemaTableKind[] = [];
	const attrs: SchemaTableKind[] = [];
	for (const t of schemaTables) {
		if (geomNames.has(t.name)) continue;
		const k = tableKind(t);
		if (k === "lookup") lookups.push(t);
		else if (k === "junction") links.push(t);
		else attrs.push(t);
	}
	const byName = (a: SchemaTableKind, b: SchemaTableKind) =>
		(a.label || a.name).localeCompare(b.label || b.name, undefined, {
			numeric: true,
			sensitivity: "base",
		});
	lookups.sort(byName);
	links.sort(byName);
	attrs.sort(byName);
	const out: AttrTableGroup[] = [];
	// Raw tables first; callers that flatten use icon (not labels) to distinguish.
	if (attrs.length)
		out.push({ key: "attribute", label: "Tables", tables: attrs });
	if (links.length) out.push({ key: "junction", label: "Links", tables: links });
	if (lookups.length) out.push({ key: "lookup", label: "Lookups", tables: lookups });
	return out;
}
