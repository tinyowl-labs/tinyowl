import type { DiffOp } from "./types";

/** Single op-colour table for Leaflet ReviewMap and Cesium overlay. */
export const DIFF_OP_FILL: Record<DiffOp, string> = {
    insert: "#34d399",
    update: "#fbbf24",
    delete: "#f87171",
    head: "#64748b",
};
