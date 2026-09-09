<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import BoxIcon from "@lucide/svelte/icons/box";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import ArtefactMicroViewer from "$lib/components/artefacts/ArtefactMicroViewer.svelte";
    import ArtefactTilesetProgress from "$lib/components/artefacts/ArtefactTilesetProgress.svelte";
    import ImageDetailStage from "$lib/components/media/ImageDetailStage.svelte";
    import { imageDetailSrcs } from "$lib/project/imageDetailSrcs";
    import {
        artefactMediaUrl,
        entityLabel,
        formatBytes,
        isPdf,
        isTileset,
        isTiff,
        linkedEntities,
        modelPreviewSource,
        tilesetIngestFailed,
        tilesetNeedsIngest,
        type ArtefactMediaItem,
    } from "$lib/components/artefacts/artefactMedia";
    import { entityLayersHref } from "$lib/project/entityLink";

    let {
        item,
        accessToken,
        projectSlug,
        viewerIdx,
        imageCount,
        closeViewer,
        prevImage,
        nextImage,
        openIn3D,
    }: {
        item: ArtefactMediaItem;
        accessToken: string;
        projectSlug: string;
        viewerIdx: number;
        imageCount: number;
        closeViewer: () => void;
        prevImage: () => void;
        nextImage: () => void;
        openIn3D: (hash: string) => void;
    } = $props();

    const pdf = $derived(isPdf(item));
    const tileset = $derived(isTileset(item));
    const ingestBusy = $derived(tileset && tilesetNeedsIngest(item));
    const ingestFailed = $derived(tileset && tilesetIngestFailed(item));
    const modelSrc = $derived(
        !ingestBusy && !ingestFailed
            ? modelPreviewSource(item, projectSlug)
            : null,
    );
    const links = $derived(linkedEntities(item));
    const imageSrcs = $derived(
        imageDetailSrcs(item.url, {
            hash: item.hash,
            accessToken,
            tiff: isTiff(item),
        }),
    );

    function entityLink(entityType: string, entityId: string): string {
        return entityLayersHref(projectSlug, {
            layer: entityType,
            highlight: entityId,
        });
    }

    function mediaUrl(opts?: { pdfFit?: boolean; variant?: "preview" | "full" }) {
        return artefactMediaUrl(item, accessToken, opts);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if pdf}
    <div
        class="fixed top-11 inset-x-0 bottom-0 z-[60] surface flex flex-col"
        onclick={closeViewer}
        role="dialog"
        tabindex="-1"
    >
        <div
            class="flex items-center justify-between gap-3 px-4 py-3 border-b border-border"
            onclick={(e) => e.stopPropagation()}
        >
            <p class="text-sm text-muted-foreground tabular-nums">
                Report · {formatBytes(item.file_size)}
            </p>
            <div class="flex items-center gap-1">
                <a
                    href={mediaUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs no-underline text-foreground hover:bg-secondary transition-colors"
                    onclick={(e) => e.stopPropagation()}
                >
                    <ExternalLinkIcon class="size-3.5" />
                    Open
                </a>
                <button
                    type="button"
                    class="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    onclick={(e) => {
                        e.stopPropagation();
                        closeViewer();
                    }}
                    aria-label="Close"
                >
                    <XIcon class="size-4" />
                </button>
            </div>
        </div>
        <div
            class="relative min-h-0 flex-1 overflow-hidden"
            onclick={(e) => e.stopPropagation()}
        >
            <iframe
                title="PDF viewer"
                src={mediaUrl({ pdfFit: true })}
                class="h-full w-full border-0 bg-background"
            ></iframe>
        </div>
    </div>
{:else if modelSrc || ingestBusy || ingestFailed}
    <div
        class="fixed top-11 inset-x-0 bottom-0 z-[60] bg-black/40 p-4 md:p-8"
        onclick={(e) => {
            if (e.target === e.currentTarget) closeViewer();
        }}
        role="dialog"
        tabindex="-1"
        aria-label="3D preview"
        onkeydown={(e) => {
            if (e.key === "Escape") closeViewer();
        }}
    >
        <div
            class="relative h-full w-full min-h-0 overflow-hidden rounded-md bg-neutral-950"
            onclick={(e) => e.stopPropagation()}
        >
            {#if ingestBusy || ingestFailed}
                <ArtefactTilesetProgress {item} class="absolute inset-0" />
            {:else if modelSrc}
                <ArtefactMicroViewer
                    url={modelSrc.url}
                    kind={modelSrc.kind}
                    {accessToken}
                    chrome={false}
                    class="absolute inset-0"
                />
            {/if}
            <div class="absolute top-2 right-2 z-20 flex items-center gap-1">
                {#if tileset && !ingestBusy && !ingestFailed}
                    <button
                        type="button"
                        class="rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground hover:text-foreground"
                        title="Open in Layers"
                        aria-label="Open in Layers"
                        onclick={() => openIn3D(item.hash)}
                    >
                        <BoxIcon class="size-4" />
                    </button>
                {/if}
                <button
                    type="button"
                    class="rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground hover:text-foreground"
                    onclick={closeViewer}
                    aria-label="Close"
                >
                    <XIcon class="size-4" />
                </button>
            </div>
        </div>
    </div>
{:else}
    <div
        class="fixed top-11 inset-x-0 bottom-0 z-[60] bg-black/40 p-4 md:p-8"
        onclick={(e) => {
            if (e.target === e.currentTarget) closeViewer();
        }}
        role="dialog"
        tabindex="-1"
        aria-label="Image"
        onkeydown={(e) => {
            if (e.key === "Escape") closeViewer();
        }}
    >
        <div
            class="relative h-full w-full min-h-0"
            onclick={(e) => e.stopPropagation()}
        >
            {#if viewerIdx > 0}
                <button
                    type="button"
                    class="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-md border border-border bg-background/90 p-2 text-muted-foreground hover:text-foreground"
                    onclick={prevImage}
                    aria-label="Previous"
                >
                    <ChevronLeft class="size-5" />
                </button>
            {/if}
            {#key `${imageSrcs.preview}:${imageSrcs.full}`}
                <ImageDetailStage
                    previewSrc={imageSrcs.preview}
                    fullSrc={imageSrcs.full}
                    class="absolute inset-0"
                />
            {/key}
            {#if viewerIdx >= 0 && viewerIdx < imageCount - 1}
                <button
                    type="button"
                    class="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-md border border-border bg-background/90 p-2 text-muted-foreground hover:text-foreground"
                    onclick={nextImage}
                    aria-label="Next"
                >
                    <ChevronRight class="size-5" />
                </button>
            {/if}
            <div class="absolute top-2 right-2 z-20 flex items-center gap-1">
                {#if links[0]}
                    <a
                        href={entityLink(links[0].entity_type, links[0].entity_id)}
                        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1 text-xs no-underline text-foreground hover:bg-secondary"
                    >
                        <MapPinIcon class="size-3.5" />
                        Open in Layers
                    </a>
                {/if}
                <button
                    type="button"
                    class="rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground hover:text-foreground"
                    onclick={closeViewer}
                    aria-label="Close"
                >
                    <XIcon class="size-4" />
                </button>
            </div>
            {#if viewerIdx >= 0}
                <p
                    class="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-md bg-background/90 px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
                >
                    {viewerIdx + 1} / {imageCount}
                </p>
            {/if}
            {#if links.length > 0}
                <div
                    class="absolute bottom-14 left-1/2 z-20 flex max-w-[min(100%,36rem)] -translate-x-1/2 flex-wrap justify-center gap-1.5 px-2"
                >
                    {#each links as entity (`${entity.entity_type}:${entity.entity_id}`)}
                        <a
                            href={entityLink(entity.entity_type, entity.entity_id)}
                            class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 py-1 text-[11px] no-underline text-foreground hover:bg-secondary"
                        >
                            {entityLabel(entity.entity_type)}
                            <span class="font-mono text-muted-foreground"
                                >{entity.entity_id}</span
                            >
                        </a>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}
