export type MapRow = Record<string, unknown>;
export type LayerRowIndexes = Map<string, Map<string, MapRow>>;

/** Match rowByEntityId's trimmed, case-sensitive IDs and first-row precedence. */
export function indexMapRows(rows: Record<string, MapRow[]>): LayerRowIndexes {
    const layers: LayerRowIndexes = new Map();
    for (const [name, table] of Object.entries(rows)) {
        const index = new Map<string, MapRow>();
        for (const row of table) {
            const id = String(row.source_id ?? row.SOURCE_ID ?? "").trim();
            if (!index.has(id)) index.set(id, row);
        }
        layers.set(name, index);
    }
    return layers;
}

export function indexedMapRow(indexes: LayerRowIndexes, layer: string, id: string): MapRow | undefined {
    return indexes.get(layer)?.get(id.trim());
}
