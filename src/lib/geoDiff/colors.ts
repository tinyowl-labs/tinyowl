import type { DiffOp } from "./types";

/** Single op-colour table for Leaflet ReviewMap and Cesium overlay. */
export const DIFF_OP_FILL: Record<DiffOp, string> = {
    insert: "#34d399",
    update: "#fbbf24",
    delete: "#f87171",
    head: "#64748b",
};

export const DIFF_OP_LEGEND: { op: DiffOp; label: string; swatch: string }[] = [
    { op: "insert", label: "insert", swatch: "bg-emerald-400" },
    { op: "update", label: "update", swatch: "bg-amber-400" },
    { op: "delete", label: "delete", swatch: "bg-red-400" },
];

export const DIFF_BEFORE_FILL_OPACITY = 0.28;
export const DIFF_BEFORE_POINT_OPACITY = 0.4;
