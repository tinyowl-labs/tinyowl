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
	const targetCache = new Map<string, LookupOpt[]>();
	const loadTarget = async (target: string) => {
		const hit = targetCache.get(target);
		if (hit) return hit;
		const rowsRes = await fetch(
			`/api/v1/projects/${encodeURIComponent(slug)}/tables/${encodeURIComponent(target)}/rows`,
			{ headers },
		);
		const optsList = rowsRes.ok
			? optsFromRows(
					((await rowsRes.json()) as { rows?: Record<string, unknown>[] })
						.rows,
				)
			: [];
		targetCache.set(target, optsList);
		return optsList;
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
	if (lookups.length) out.push({ key: "lookup", label: "Lookups", tables: lookups });
	if (links.length) out.push({ key: "junction", label: "Links", tables: links });
	if (attrs.length)
		out.push({ key: "attribute", label: "Tables", tables: attrs });
	return out;
}
