import type { DiffOp, ListChangeCol } from "./types";

const ID_NAMES = ["source_id", "entity_id", "fid", "id"] as const;

export function entityIdFromChanges(
    changes: ListChangeCol[] | undefined,
    fallback: string,
): string {
    const cols = changes ?? [];
    for (const name of ID_NAMES) {
        const col = cols.find((c) => String(c?.name ?? "") === name);
        if (!col) continue;
        const v = col.new ?? col.old;
        if (v != null && v !== "") return String(v);
    }
    return fallback;
}

export function parseDiffOp(raw: unknown): DiffOp {
    const s = String(raw ?? "").toLowerCase();
    if (s === "insert" || s === "update" || s === "delete" || s === "head") {
        return s;
    }
    return "head";
}
