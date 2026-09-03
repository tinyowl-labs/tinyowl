/** Shared layer payload for Layers map (CZML packets, not GeoJSON). */

import type { LayerView } from "./layerViews";

export type LayerData = {
    name: string;
    packets: Record<string, unknown>[];
    /** Stable entity ids for scene graph / selection (source_id). */
    entityIds: string[];
    visible: boolean;
    /** Session-only layer alpha (0–1). Not saved on the view. */
    opacity?: number;
    views?: LayerView[];
    activeViewId?: string;
};
