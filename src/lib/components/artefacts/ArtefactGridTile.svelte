<script lang="ts">
    import ImageOffIcon from "@lucide/svelte/icons/image-off";
    import VideoIcon from "@lucide/svelte/icons/video";
    import MusicIcon from "@lucide/svelte/icons/music";
    import FileTextIcon from "@lucide/svelte/icons/file-text";
    import FileWarningIcon from "@lucide/svelte/icons/file-warning";
    import BoxIcon from "@lucide/svelte/icons/box";
    import {
        entityLabel,
        isCoverage,
        isGltf,
        isPdf,
        isTileset,
        isTiff,
        shortHash,
        tilesetIngestFailed,
        tilesetNeedsIngest,
        type ArtefactMediaItem,
    } from "$lib/components/artefacts/artefactMedia";

    let {
        item,
        active,
        imgLoaded,
        imgFailed,
        thumbSrc,
        onselect,
        onopen,
        onimgload,
        onimgerror,
    }: {
        item: ArtefactMediaItem;
        active: boolean;
        imgLoaded: boolean;
        imgFailed: boolean;
        thumbSrc: string;
        onselect: () => void;
        onopen: () => void;
        onimgload: () => void;
        onimgerror: () => void;
    } = $props();

    const isImage = $derived(
        item.media_type.startsWith("image/") && !isTiff(item),
    );
    const isVideo = $derived(item.media_type.startsWith("video/"));
    const isAudio = $derived(item.media_type.startsWith("audio/"));
    const tileset = $derived(isTileset(item));
    const pdf = $derived(isPdf(item));
    const ingestBusy = $derived(tileset && tilesetNeedsIngest(item));
    const ingestFailed = $derived(tileset && tilesetIngestFailed(item));
    const title = $derived(
        tileset
            ? ingestFailed
                ? `3D model · ingest failed · ${shortHash(item.hash)}`
                : ingestBusy
                  ? `3D model · processing · ${shortHash(item.hash)}`
                  : `3D model · ${shortHash(item.hash)}`
            : item.entities[0]
              ? `${entityLabel(item.entities[0].entity_type)} · ${item.entities[0].entity_id}`
              : item.media_type,
    );
</script>

<button
    type="button"
    onclick={onselect}
    ondblclick={onopen}
    class="group relative aspect-square overflow-hidden rounded-md bg-secondary/60 outline-none transition-[box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring {active
        ? ''
        : 'hover:shadow-[inset_0_0_0_1px_var(--color-border)]'}"
    {title}
>
    {#if isImage}
        {#if !imgLoaded && !imgFailed}
            <div class="absolute inset-0 animate-pulse bg-secondary"></div>
        {/if}
        {#if imgFailed}
            <div class="absolute inset-0 flex items-center justify-center">
                <ImageOffIcon class="size-6 text-muted-foreground/40" />
            </div>
        {/if}
        <img
            src={thumbSrc}
            alt=""
            class="h-full w-full object-cover {imgLoaded
                ? 'opacity-100'
                : 'opacity-0'} transition-opacity duration-200"
            loading="lazy"
            onload={onimgload}
            onerror={onimgerror}
        />
    {:else if tileset || isGltf(item)}
        <div
            class="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-neutral-800 to-neutral-950 text-muted-foreground"
        >
            <BoxIcon class="size-6 opacity-70" />
            <span class="text-[10px] uppercase tracking-wide opacity-70">3D</span>
        </div>
        {#if ingestBusy}
            <span
                class="pointer-events-none absolute top-1 right-1 z-20 rounded bg-background/90 px-1 py-0.5 text-[10px] text-muted-foreground"
            >
                processing
            </span>
        {:else if ingestFailed}
            <span
                class="pointer-events-none absolute top-1 right-1 z-20 rounded bg-destructive/90 px-1 py-0.5 text-[10px] text-destructive-foreground"
            >
                failed
            </span>
        {/if}
    {:else}
        <div
            class="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground"
        >
            {#if isVideo}
                <VideoIcon class="size-6 opacity-70" />
            {:else if isAudio}
                <MusicIcon class="size-6 opacity-70" />
            {:else if pdf}
                <FileTextIcon class="size-6 opacity-70" />
                <span class="text-[10px] uppercase tracking-wide opacity-70"
                    >PDF</span
                >
            {:else}
                <FileWarningIcon class="size-6 opacity-70" />
            {/if}
        </div>
    {/if}
    {#if active}
        <span
            class="pointer-events-none absolute inset-0 z-10 rounded-md border-2 border-primary"
            aria-hidden="true"
        ></span>
    {/if}
    {#if item.entities.length > 0}
        <span
            class="pointer-events-none absolute bottom-1 left-1 z-20 rounded bg-background/80 px-1 py-0.5 text-[10px] text-foreground/80 opacity-0 transition-opacity group-hover:opacity-100 {active
                ? 'opacity-100'
                : ''}"
        >
            {entityLabel(item.entities[0].entity_type)}
        </span>
    {/if}
    {#if isCoverage(item) && !tileset}
        <span
            class="pointer-events-none absolute top-1 left-1 z-20 rounded bg-background/90 px-1 py-0.5 text-[10px] text-muted-foreground"
        >
            coverage
        </span>
    {/if}
</button>
