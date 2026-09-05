import { asGeometry, geometriesEqual } from "./geometry";
import type { DiffFeature, EditBufferEntry } from "./types";

/**
 * Map a local CRUD edit buffer onto the same overlay model as ListChanges.
 * Draw/buffer tickets own the buffer; this is the only adapter they need.
 */
export function fromEditBuffer(entries: EditBufferEntry[]): DiffFeature[] {
    return entries.flatMap((e, i): DiffFeature[] => {
        if (e.op === "delete") {
            const g =
                asGeometry(e.geometry) ?? asGeometry(e.oldGeometry) ?? null;
            if (!g) return [];
            return [
                {
                    id: e.entityId || String(i),
                    table: e.table,
                    entityId: e.entityId || String(i),
                    op: "delete" as const,
                    geometry: g,
                },
            ];
        }
        const geometry = asGeometry(e.geometry) ?? null;
        let oldGeometry = asGeometry(e.oldGeometry) ?? null;
        if (e.op !== "update" || geometriesEqual(oldGeometry, geometry)) {
            oldGeometry = null;
        }
        if (!geometry && !oldGeometry) return [];
        return [
            {
                id: e.entityId || String(i),
                table: e.table,
                entityId: e.entityId || String(i),
                op: e.op,
                geometry,
                ...(oldGeometry ? { oldGeometry } : {}),
            },
        ];
    });
}
