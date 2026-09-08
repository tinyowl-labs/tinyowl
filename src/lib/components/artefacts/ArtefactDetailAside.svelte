<script lang="ts">
    import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import BoxIcon from "@lucide/svelte/icons/box";
    import MusicIcon from "@lucide/svelte/icons/music";
    import FileWarningIcon from "@lucide/svelte/icons/file-warning";
    import SparklesIcon from "@lucide/svelte/icons/sparkles";
    import SearchIcon from "@lucide/svelte/icons/search";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import CheckIcon from "@lucide/svelte/icons/check";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import ArtefactMicroViewer from "$lib/components/artefacts/ArtefactMicroViewer.svelte";
    import {
        artefactMediaUrl,
        entityLabel,
        formatBytes,
        isModel3D,
        isPdf,
        isTiff,
        isTileset,
        linkedEntities,
        modelPreviewSource,
        shortHash,
        type ArtefactMediaItem,
        type ArtefactSimilarHit,
    } from "$lib/components/artefacts/artefactMedia";
    import {
        formatDateSpan,
        searchHref,
        type SearchBBox,
    } from "$lib/search/params";
    import { browserThumbUrl } from "$lib/project/mediaUrl";
    import { entityLayersHref } from "$lib/project/entityLink";

    type Period = { dateFrom: number | null; dateTo: number | null } | null;

    let {
        item,
        accessToken,
        projectSlug,
        canUpload,
        viewerOpen,
        careSaving,
        careError,
        hashCopied,
        similarItems,
        similarStatus,
        similarLoading,
        similarSamePeriod,
        similarSameRegion,
        projectPeriod,
        projectRegion,
        thumbSrc,
        openViewer,
        openIn3D,
        patchCare,
        findSimilar,
        setSamePeriod,
        setSameRegion,
        copyHash,
        onSelectSimilar,
    }: {
        item: ArtefactMediaItem;
        accessToken: string;
        projectSlug: string;
        canUpload: boolean;
        viewerOpen: boolean;
        careSaving: boolean;
        careError: string;
        hashCopied: boolean;
        similarItems: ArtefactSimilarHit[];
        similarStatus: string;
        similarLoading: boolean;
        similarSamePeriod: boolean;
        similarSameRegion: boolean;
        projectPeriod: Period;
        projectRegion: SearchBBox | null;
        thumbSrc: string;
        openViewer: () => void;
        openIn3D: (hash: string) => void;
        patchCare: (
            hash: string,
            patch: {
                care_allow_public_view?: boolean;
                care_allow_embed?: boolean;
            },
        ) => void;
        findSimilar: () => void;
        setSamePeriod: (on: boolean) => void;
        setSameRegion: (on: boolean) => void;
        copyHash: (hash: string) => void;
        onSelectSimilar: (hit: ArtefactSimilarHit) => void;
    } = $props();

    const isImage = $derived(item.media_type.startsWith("image/"));
    const isVideo = $derived(item.media_type.startsWith("video/"));
    const isAudio = $derived(item.media_type.startsWith("audio/"));
    const pdf = $derived(isPdf(item));
    const tileset = $derived(isTileset(item));
    const model3d = $derived(isModel3D(item));
    const modelSrc = $derived(
        model3d ? modelPreviewSource(item, projectSlug) : null,
    );
    const links = $derived(linkedEntities(item));
    const kindLabel = $derived(
        pdf
            ? "Report"
            : model3d
              ? "3D model"
              : isImage
                ? isTiff(item)
                    ? "Raster"
                    : "Photo"
                : isVideo
                  ? "Video"
                  : isAudio
                    ? "Audio"
                    : "File",
    );
    const similarHref = $derived(
        searchHref({
            mediaHash: item.hash,
            dateFrom: similarSamePeriod ? projectPeriod?.dateFrom : null,
            dateTo: similarSamePeriod ? projectPeriod?.dateTo : null,
            bbox: similarSameRegion ? projectRegion : null,
        }),
    );
    const publicView = $derived(item.care_allow_public_view !== false);
    const embedOk = $derived(item.care_allow_embed !== false);

    function mediaUrl(opts?: { pdfFit?: boolean; variant?: "preview" | "full" }) {
        return artefactMediaUrl(item, accessToken, opts);
    }

    function entityLink(entityType: string, entityId: string): string {
        return entityLayersHref(projectSlug, {
            layer: entityType,
            highlight: entityId,
        });
    }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-1 px-3 py-2">
        <p class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {kindLabel}
            <span class="font-normal text-muted-foreground"
                >· {formatBytes(item.file_size)}</span
            >
        </p>
        {#if model3d && tileset}
            <button
                type="button"
                onclick={() => openIn3D(item.hash)}
                class="rounded-md p-1 text-muted-foreground hover:text-foreground"
                title="Open in Layers"
                aria-label="Open in Layers"
            >
                <BoxIcon class="size-3.5" />
            </button>
        {/if}
        {#if pdf}
            <a
                href={mediaUrl()}
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md p-1 text-muted-foreground no-underline hover:text-foreground"
                title="Open"
                aria-label="Open"
            >
                <ExternalLinkIcon class="size-3.5" />
            </a>
        {/if}
    </div>

    {#if isImage || pdf}
        <button
            type="button"
            onclick={openViewer}
            class="group/preview relative block w-full shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            title="Expand"
            aria-label="Expand"
        >
            {#if isImage}
                <img
                    src={thumbSrc}
                    alt=""
                    class="mx-auto block h-auto max-h-[min(52vh,28rem)] w-auto max-w-full"
                />
            {:else}
                <iframe
                    title="PDF preview"
                    src={mediaUrl({ pdfFit: true })}
                    class="pointer-events-none h-[min(40vh,18rem)] w-full border-0"
                ></iframe>
            {/if}
            <span
                class="pointer-events-none absolute bottom-2 right-2 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100"
            >
                <Maximize2Icon class="size-3" />
            </span>
        </button>
    {:else if model3d && modelSrc}
        <div class="group/preview relative aspect-[4/3] w-full shrink-0">
            {#if !viewerOpen}
                <ArtefactMicroViewer
                    url={modelSrc.url}
                    kind={modelSrc.kind}
                    {accessToken}
                    class="absolute inset-0"
                />
                <button
                    type="button"
                    onclick={openViewer}
                    class="absolute bottom-2 right-2 z-20 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover/preview:opacity-100 hover:bg-background"
                    title="Expand 3D preview"
                    aria-label="Expand 3D preview"
                >
                    <Maximize2Icon class="size-3" />
                </button>
            {:else}
                <div
                    class="flex h-full items-center justify-center text-xs text-muted-foreground"
                >
                    Expanded preview
                </div>
            {/if}
        </div>
    {:else if isVideo}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={mediaUrl()} controls class="w-full shrink-0"></video>
    {:else if isAudio}
        <div class="flex shrink-0 flex-col items-center gap-2 px-3 py-4">
            <MusicIcon class="size-6 text-muted-foreground/50" />
            <audio src={mediaUrl()} controls class="w-full"></audio>
        </div>
    {:else}
        <div
            class="flex shrink-0 items-center justify-center gap-2 px-3 py-6 text-muted-foreground"
        >
            <FileWarningIcon class="size-5 opacity-50" />
            <span class="text-xs">{item.media_type}</span>
        </div>
    {/if}

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {#if canUpload}
            <div
                class="inline-flex rounded-md bg-muted p-0.5"
                role="group"
                aria-label="CARE"
            >
                <button
                    type="button"
                    disabled={careSaving}
                    aria-pressed={publicView}
                    title="Allow public view"
                    onclick={() =>
                        patchCare(item.hash, {
                            care_allow_public_view: !publicView,
                        })}
                    class="rounded px-2 py-1 text-[11px] font-medium disabled:opacity-50 {publicView
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    Public
                </button>
                <button
                    type="button"
                    disabled={careSaving}
                    aria-pressed={embedOk}
                    title="Allow embedding"
                    onclick={() =>
                        patchCare(item.hash, {
                            care_allow_embed: !embedOk,
                        })}
                    class="rounded px-2 py-1 text-[11px] font-medium disabled:opacity-50 {embedOk
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    Embed
                </button>
            </div>
        {/if}
        {#if careError}
            <p class="text-[11px] text-destructive">{careError}</p>
        {/if}

        {#if links.length > 0}
            <ul class="space-y-0.5">
                {#each links as entity (`${entity.entity_type}:${entity.entity_id}`)}
                    <li>
                        <a
                            href={entityLink(
                                entity.entity_type,
                                entity.entity_id,
                            )}
                            class="flex items-center gap-2 rounded-md px-1 py-1 text-xs no-underline hover:bg-accent/60"
                        >
                            <MapPinIcon
                                class="size-3.5 shrink-0 text-muted-foreground"
                            />
                            <span class="min-w-0 flex-1 truncate text-foreground"
                                >{entityLabel(entity.entity_type)}</span
                            >
                            <span
                                class="max-w-[45%] truncate font-mono text-[10px] text-muted-foreground"
                                >{entity.entity_id}</span
                            >
                        </a>
                    </li>
                {/each}
            </ul>
        {/if}

        <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            title={item.hash}
            onclick={() => copyHash(item.hash)}
        >
            {#if hashCopied}
                <CheckIcon class="size-3 text-foreground" />
            {:else}
                <CopyIcon class="size-3" />
            {/if}
            {shortHash(item.hash)}
        </button>

        <div class="flex flex-col gap-2 {isImage ? '' : 'hidden'}">
            <div class="flex items-center gap-0.5">
                <button
                    type="button"
                    onclick={findSimilar}
                    disabled={similarLoading}
                    class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
                >
                    <SparklesIcon class="size-3.5" />
                    {similarLoading ? "Searching…" : "Similar"}
                </button>
                <a
                    href={similarHref}
                    class="rounded-md p-1 text-muted-foreground no-underline hover:bg-accent/60 hover:text-foreground"
                    title="Search with this photo"
                    aria-label="Search with this photo"
                >
                    <SearchIcon class="size-3.5" />
                </a>
                <span class="ml-auto flex items-center gap-0.5">
                    <button
                        type="button"
                        disabled={!projectPeriod}
                        aria-pressed={similarSamePeriod}
                        onclick={() => setSamePeriod(!similarSamePeriod)}
                        class="rounded-md px-1.5 py-0.5 text-[11px] disabled:opacity-40 {similarSamePeriod
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground'}"
                        title={projectPeriod
                            ? (formatDateSpan(
                                  projectPeriod.dateFrom,
                                  projectPeriod.dateTo,
                              ) ?? "Same period")
                            : "No project period set"}
                    >
                        Period
                    </button>
                    <button
                        type="button"
                        disabled={!projectRegion}
                        aria-pressed={similarSameRegion}
                        onclick={() => setSameRegion(!similarSameRegion)}
                        class="rounded-md px-1.5 py-0.5 text-[11px] disabled:opacity-40 {similarSameRegion
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground'}"
                        title={projectRegion
                            ? "Same region as this project"
                            : "No project region set"}
                    >
                        Region
                    </button>
                </span>
            </div>
            {#if similarStatus && similarItems.length === 0}
                <p class="text-xs text-muted-foreground">{similarStatus}</p>
            {:else if similarItems.length > 0}
                <div class="grid grid-cols-3 gap-1">
                    {#each similarItems as sim (sim.hash)}
                        <button
                            type="button"
                            class="aspect-square overflow-hidden rounded-md bg-secondary/60"
                            title="{sim.project_title} · {sim.distance.toFixed(
                                3,
                            )}"
                            onclick={() => onSelectSimilar(sim)}
                        >
                            {#if sim.media_type.startsWith("image/")}
                                <img
                                    src={browserThumbUrl(sim.url, {
                                        hash: sim.hash,
                                        accessToken,
                                    })}
                                    alt=""
                                    class="h-full w-full object-cover"
                                />
                            {:else}
                                <div
                                    class="flex h-full items-center justify-center text-[10px] text-muted-foreground"
                                >
                                    {sim.project_title}
                                </div>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>
