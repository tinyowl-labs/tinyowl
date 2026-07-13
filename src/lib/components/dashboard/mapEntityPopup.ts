/** Shared entity popup helpers for Leaflet (2D) and Cesium (3D). */

export function featureEntityId(feature: GeoJSON.Feature): string {
    return String(
        feature.properties?.entity_id ?? feature.properties?.source_id ?? "",
    );
}

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function buildEntityPopupHtml(
    layerName: string,
    entityId: string,
    rows: Record<string, Record<string, unknown>[]>,
): string {
    const tableRows = rows[layerName] ?? [];
    const entity = tableRows.find((r) => {
        const id = String(r.source_id ?? r.SOURCE_ID ?? "");
        return id.trim() === entityId.trim();
    });
    if (!entity) {
        return `<div class="text-sm"><strong>${escapeHtml(layerName.replace(/_/g, " "))}</strong><br /><span class="font-mono text-xs opacity-60">${escapeHtml(entityId)}</span></div>`;
    }

    const fields = Object.entries(entity).filter(
        ([k]) => !k.startsWith("_") && k !== "geom" && k !== "entity_type",
    );

    let html = `<div class="text-sm max-w-xs max-h-64 overflow-y-auto">`;
    html += `<strong class="text-base">${escapeHtml(layerName.replace(/_/g, " "))}</strong>`;
    html += `<div class="font-mono text-[10px] opacity-60 mb-2">${escapeHtml(entityId)}</div>`;

    for (const [key, val] of fields) {
        const label = key.replace(/_/g, " ");
        const display =
            val === null || val === undefined || val === ""
                ? '<span class="opacity-60 italic">—</span>'
                : escapeHtml(String(val));
        html += `<div class="mt-1"><span class="font-medium text-[11px]">${escapeHtml(label)}</span><br /><span class="text-xs break-words">${display}</span></div>`;
    }
    html += `</div>`;
    return html;
}

export function isEntityHighlighted(
    layerName: string,
    entityId: string,
    highlightId: string,
    highlightLayer: string,
    layerNames: string[],
): boolean {
    if (!highlightId || !entityId) return false;
    if (entityId.trim() !== highlightId.trim()) return false;
    if (!highlightLayer) return true;
    if (!layerNames.includes(highlightLayer)) return true;
    return layerName === highlightLayer;
}
