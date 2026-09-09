/** Shared artefact shelf types and pure helpers. */

export interface ArtefactMediaItem {
    hash: string;
    media_type: string;
    file_size: number;
    url: string;
    profile?: string;
    entities: Array<{ entity_type: string; entity_id: string }>;
    care_allow_public_view?: boolean;
    care_allow_embed?: boolean;
    care_note?: string | null;
    /** Tileset extract queue — pending | processing | ready | failed | awaiting_blob */
    ingest_status?: string;
    ingest_error?: string;
    ingest_started_at?: string;
}

export type ArtefactSimilarHit = {
    hash: string;
    media_type: string;
    url: string;
    project_slug: string;
    project_title: string;
    entity_type?: string;
    entity_id?: string;
    distance: number;
};

export function isPdf(item: ArtefactMediaItem): boolean {
    return item.media_type === "application/pdf";
}

export function isTiff(item: ArtefactMediaItem): boolean {
    const t = item.media_type.toLowerCase();
    return t.includes("tiff") || t.includes("geotiff");
}

export function isGltf(item: ArtefactMediaItem): boolean {
    const t = item.media_type.toLowerCase();
    return (
        t.startsWith("model/gltf") ||
        t === "model/gltf-binary" ||
        t === "model/gltf+json"
    );
}

export function isTileset(item: ArtefactMediaItem): boolean {
    return (
        item.media_type === "model/vnd.3dtiles" ||
        item.media_type === "application/vnd.3dtiles+zip" ||
        item.entities?.some((e) => e.entity_type === "tileset")
    );
}

export function isModel3D(item: ArtefactMediaItem): boolean {
    return isTileset(item) || isGltf(item);
}

export function tilesetIngestStatus(item: ArtefactMediaItem): string {
    return (item.ingest_status || "").trim().toLowerCase();
}

/** True while the extract worker has not finished (or not started). */
export function tilesetNeedsIngest(item: ArtefactMediaItem): boolean {
    if (!isTileset(item)) return false;
    const s = tilesetIngestStatus(item);
    return (
        s === "pending" ||
        s === "processing" ||
        s === "awaiting_blob" ||
        s === "queued"
    );
}

export function tilesetIngestFailed(item: ArtefactMediaItem): boolean {
    return isTileset(item) && tilesetIngestStatus(item) === "failed";
}

export function tilesetPreviewReady(item: ArtefactMediaItem): boolean {
    if (!isTileset(item)) return isGltf(item);
    const s = tilesetIngestStatus(item);
    // Legacy rows with no status are treated as ready (same as coverage loaders).
    return !s || s === "ready";
}

export function isCoverage(item: ArtefactMediaItem): boolean {
    if (item.profile === "coverage") return true;
    return (
        isTileset(item) ||
        item.entities?.some((e) => e.entity_type === "coverage") === true
    );
}

export function linkedEntities(item: ArtefactMediaItem) {
    return item.entities.filter(
        (e) =>
            e.entity_id.trim() !== "" &&
            e.entity_type.trim() !== "" &&
            e.entity_type !== "unknown" &&
            e.entity_type !== "tileset" &&
            e.entity_type !== "coverage",
    );
}

export function shortHash(hash: string): string {
    return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function entityLabel(entityType: string): string {
    return entityType.replace(/_/g, " ");
}

export function tilesetRootUrl(projectSlug: string, hash: string): string {
    return `/api/v1/projects/${projectSlug}/tilesets/${hash}/tileset.json`;
}

export function modelPreviewSource(
    item: ArtefactMediaItem,
    projectSlug: string,
): { kind: "tileset" | "gltf"; url: string } | null {
    if (isGltf(item) && !isTileset(item)) {
        return { kind: "gltf", url: item.url };
    }
    if (isTileset(item) && !tilesetPreviewReady(item)) {
        return null;
    }
    if (isTileset(item) || isGltf(item)) {
        return { kind: "tileset", url: tilesetRootUrl(projectSlug, item.hash) };
    }
    return null;
}

export function artefactMediaUrl(
    item: ArtefactMediaItem,
    accessToken: string,
    opts?: { pdfFit?: boolean; variant?: "preview" | "full" },
): string {
    const params = new URLSearchParams();
    if (accessToken) params.set("token", accessToken);
    if (opts?.variant === "preview") params.set("variant", "preview");
    const qs = params.toString();
    const base = qs ? `${item.url}?${qs}` : item.url;
    if (opts?.pdfFit && item.media_type === "application/pdf") {
        return `${base}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
    }
    return base;
}
