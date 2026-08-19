/** Shared tileset list item (no Cesium imports — safe for SSR). */
export type ProjectTileset = {
    hash: string;
    label?: string;
    ingest_status: string;
    ingest_error?: string;
    root_url?: string;
    bbox_wgs84?: number[];
    /** Metres along ellipsoid normal; shifts mesh to match entity heights. */
    height_offset_m?: number | null;
    media_type?: string;
    file_size?: number;
    /** local = not Earth-fixed; omit/empty = globe placement. */
    placement?: string;
    georef_status?: string;
    meta?: Record<string, unknown>;
};

export function isLocalTileset(t: ProjectTileset): boolean {
    const placement =
        t.placement ||
        (typeof t.meta?.placement === "string" ? t.meta.placement : "");
    const georef =
        t.georef_status ||
        (typeof t.meta?.georef_status === "string" ? t.meta.georef_status : "");
    return (
        placement.toLowerCase() === "local" ||
        georef.toLowerCase() === "none"
    );
}
