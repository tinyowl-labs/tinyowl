/** Shared layer payload for Layers map (CZML packets, not GeoJSON). */

export type LayerData = {
    name: string;
    packets: Record<string, unknown>[];
    /** Stable entity ids for scene graph / selection (source_id). */
    entityIds: string[];
    visible: boolean;
};
