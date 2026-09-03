/** Shared geo-diff model for review, history, and the eventual CRUD buffer. */

export type DiffOp = "insert" | "update" | "delete" | "head";

export type GeoJsonGeometry = {
    type: string;
    coordinates?: unknown;
    geometries?: unknown;
};

export type DiffFeature = {
    /** Stable row / buffer id (review uses ListChanges index). */
    id: string;
    table: string;
    /** Entity identity when known (`source_id` / `fid` / …). */
    entityId: string;
    op: DiffOp;
    /** After geometry (inserts, updates, head). Deletes: the removed shape. */
    geometry: GeoJsonGeometry | null;
    /** Before geometry for updates when it differs from `geometry`. */
    oldGeometry?: GeoJsonGeometry | null;
};

/** One column from go-geodiff ListChanges (server may attach GeoJSON). */
export type ListChangeCol = {
    name?: string;
    column?: number;
    old?: unknown;
    new?: unknown;
    old_geometry?: unknown;
    new_geometry?: unknown;
};

export type ListChangeEntry = {
    table?: string;
    type?: string;
    geometry?: unknown;
    changes?: ListChangeCol[];
};

/**
 * Local CRUD edit-buffer row. Same ops as ListChanges; no separate store —
 * `fromEditBuffer` maps this onto `DiffFeature` for the overlay.
 */
export type EditBufferEntry = {
    op: DiffOp;
    table: string;
    entityId: string;
    geometry?: unknown | null;
    oldGeometry?: unknown | null;
};
