import { parseSelectionKey, toSelectionKey } from "$lib/stores/layerSelection.svelte";

/** Confirmed column FKs only — not name-inferred, not `_relations` instance edges. */
export const JOIN_EDGE_KINDS = new Set(["fk"]);

export type JoinEdge = {
    source: string;
    target: string;
    source_column: string;
    target_column?: string;
    kind: string;
    allow_multi?: boolean;
};

export function isGeomColumn(name: string): boolean {
    return /^_?geom/i.test(name);
}

export function isSpatialTable(columns: string[] | undefined): boolean {
    return (columns ?? []).some(isGeomColumn);
}

function rowIdentity(row: Record<string, unknown> | undefined): string {
    if (!row) return "";
    const v = row.source_id ?? row.SOURCE_ID;
    return v == null || v === "" ? "" : String(v);
}

function rowValue(row: Record<string, unknown> | undefined, col: string): unknown {
    if (!row || !col) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, col)) return row[col];
    const lower = col.toLowerCase();
    for (const [k, v] of Object.entries(row)) {
        if (k.toLowerCase() === lower) return v;
    }
    return undefined;
}

/** Split a FK cell: scalar, JSON array, QGIS `{a,b}` / AllowMulti lists. */
export function fkCellIds(raw: unknown, allowMulti = false): string[] {
    if (raw == null || raw === "") return [];
    if (Array.isArray(raw)) {
        return raw.flatMap((v) => fkCellIds(v, true));
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
        return [String(raw)];
    }
    const s = String(raw).trim();
    if (!s) return [];

    if (s.startsWith("[")) {
        try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) return fkCellIds(parsed, true);
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

function indexByIdentity(
    rows: Record<string, unknown>[] | undefined,
): Map<string, Record<string, unknown>> {
    const m = new Map<string, Record<string, unknown>>();
    for (const row of rows ?? []) {
        const id = rowIdentity(row);
        if (id) m.set(id, row);
    }
    return m;
}

function rowsMatchingColumn(
    rows: Record<string, unknown>[] | undefined,
    col: string,
    value: string,
    allowMulti: boolean,
): Record<string, unknown>[] {
    if (!value) return [];
    const out: Record<string, unknown>[] = [];
    for (const row of rows ?? []) {
        const ids = fkCellIds(rowValue(row, col), allowMulti);
        if (ids.includes(value)) out.push(row);
    }
    return out;
}

/**
 * One-hop related keys via confirmed FK edges.
 * Selection keys stay `table:source_id` (map + table). Target `fid`/`id`
 * cells are resolved to that row's `source_id`.
 */
export function relatedSelectionKeys(
    selectedKeys: string[],
    opts: {
        edges: JoinEdge[];
        rowsByTable: Record<string, Record<string, unknown>[]>;
    },
): string[] {
    const edges = opts.edges.filter((e) => JOIN_EDGE_KINDS.has(e.kind));
    if (edges.length === 0 || selectedKeys.length === 0) return [];

    const identityCache = new Map<string, Map<string, Record<string, unknown>>>();
    const identityOf = (table: string) => {
        let m = identityCache.get(table);
        if (!m) {
            m = indexByIdentity(opts.rowsByTable[table]);
            identityCache.set(table, m);
        }
        return m;
    };

    const selectedSet = new Set(selectedKeys);
    const out = new Set<string>();
    const add = (table: string, id: string) => {
        if (!table || !id) return;
        const key = toSelectionKey(table, id);
        if (!selectedSet.has(key)) out.add(key);
    };

    const targetIdsForValue = (
        table: string,
        targetCol: string,
        value: string,
    ): string[] => {
        const col = targetCol || "source_id";
        if (
            col === "source_id" ||
            col === "SOURCE_ID" ||
            col === "entity_id"
        ) {
            return [value];
        }
        return rowsMatchingColumn(opts.rowsByTable[table], col, value, false)
            .map(rowIdentity)
            .filter(Boolean);
    };

    for (const key of selectedKeys) {
        const { layer, id } = parseSelectionKey(key);
        if (!layer || !id) continue;
        const row = identityOf(layer).get(id);

        for (const e of edges) {
            if (e.source !== layer) continue;
            const cell = row
                ? fkCellIds(rowValue(row, e.source_column), !!e.allow_multi)
                : [];
            for (const v of cell) {
                for (const tid of targetIdsForValue(
                    e.target,
                    e.target_column || "source_id",
                    v,
                )) {
                    add(e.target, tid);
                }
            }
        }

        for (const e of edges) {
            if (e.target !== layer) continue;
            const targetCol = e.target_column || "source_id";
            let joinVal = id;
            if (
                targetCol !== "source_id" &&
                targetCol !== "SOURCE_ID" &&
                targetCol !== "entity_id"
            ) {
                const raw = rowValue(row, targetCol);
                joinVal = raw == null || raw === "" ? "" : String(raw);
            }
            if (!joinVal) continue;
            for (const src of rowsMatchingColumn(
                opts.rowsByTable[e.source],
                e.source_column,
                joinVal,
                !!e.allow_multi,
            )) {
                add(e.source, rowIdentity(src));
            }
        }
    }

    return [...out];
}

export function joinHint(
    table: string,
    edges: JoinEdge[],
    columnsByTable: Record<string, string[]>,
): string {
    if (!table) return "";
    const fks = edges.filter((e) => JOIN_EDGE_KINDS.has(e.kind));
    const spatial = (name: string) => isSpatialTable(columnsByTable[name]);
    if (!spatial(table)) {
        const targets = [
            ...new Set(
                fks.filter((e) => e.source === table && spatial(e.target)).map(
                    (e) => e.target,
                ),
            ),
        ];
        if (targets.length === 0) return "";
        return `Selecting rows highlights related ${targets.join(", ")} on the map.`;
    }
    const sources = [
        ...new Set(
            fks.filter((e) => e.target === table && !spatial(e.source)).map(
                (e) => e.source,
            ),
        ),
    ];
    if (sources.length === 0) return "";
    return `Selection highlights related ${sources.join(", ")} in Tables.`;
}
