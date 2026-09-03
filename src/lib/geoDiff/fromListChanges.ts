import { asGeometry, geometriesEqual } from "./geometry";
import { entityIdFromChanges, parseDiffOp } from "./identity";
import type {
    DiffFeature,
    GeoJsonGeometry,
    ListChangeCol,
    ListChangeEntry,
} from "./types";

function asEntryList(input: unknown): ListChangeEntry[] {
    if (Array.isArray(input)) return input as ListChangeEntry[];
    if (input && typeof input === "object") {
        const g = (input as { geodiff?: unknown }).geodiff;
        if (Array.isArray(g)) return g as ListChangeEntry[];
    }
    return [];
}

function geomFromChanges(
    changes: ListChangeCol[] | undefined,
    key: "old_geometry" | "new_geometry",
) {
    for (const c of changes ?? []) {
        const g = asGeometry(c[key]);
        if (g) return g;
    }
    return null;
}

/**
 * Map go-geodiff ListChanges JSON (server-enriched with
 * `geometry` / `old_geometry` / `new_geometry`) onto overlay features.
 * Index ids match `ChangesetInspect` row selection.
 */
export function fromListChanges(input: unknown): DiffFeature[] {
    return asEntryList(input).map((e, i) => {
        const table = String(e.table ?? "");
        const op = parseDiffOp(e.type);
        const changes = Array.isArray(e.changes) ? e.changes : [];
        const entityId = entityIdFromChanges(changes, `#${i + 1}`);
        const newG = geomFromChanges(changes, "new_geometry");
        const oldG = geomFromChanges(changes, "old_geometry");
        const top = asGeometry(e.geometry);

        let geometry: GeoJsonGeometry | null = newG ?? top;
        let oldGeometry: GeoJsonGeometry | null = oldG;
        if (op === "delete") {
            geometry = oldG ?? top ?? newG;
            oldGeometry = null;
        } else if (op === "insert") {
            geometry = newG ?? top;
            oldGeometry = null;
        } else if (op === "update") {
            geometry = newG ?? top;
            if (geometriesEqual(oldGeometry, geometry)) {
                oldGeometry = null;
            }
        } else {
            oldGeometry = null;
        }

        return {
            id: String(i),
            table,
            entityId,
            op,
            geometry,
            ...(oldGeometry ? { oldGeometry } : {}),
        };
    });
}
