import { asGeometry, geometriesEqual } from "./geometry";
import type { DiffFeature, EditBufferEntry } from "./types";

/**
 * Map a local CRUD edit buffer onto the same overlay model as ListChanges.
 * Draw/buffer tickets own the buffer; this is the only adapter they need.
 */
export function fromEditBuffer(entries: EditBufferEntry[]): DiffFeature[] {
    return entries.map((e, i) => {
        const geometry = asGeometry(e.geometry) ?? null;
        let oldGeometry = asGeometry(e.oldGeometry) ?? null;
        if (e.op !== "update" || geometriesEqual(oldGeometry, geometry)) {
            oldGeometry = null;
        }
        return {
            id: e.entityId || String(i),
            table: e.table,
            entityId: e.entityId || String(i),
            op: e.op,
            geometry,
            ...(oldGeometry ? { oldGeometry } : {}),
        };
    });
}
