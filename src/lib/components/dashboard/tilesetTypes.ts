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
};
