<script lang="ts">
    import { page } from "$app/stores";
    import ImageIcon from "@lucide/svelte/icons/image";
    import FileIcon from "@lucide/svelte/icons/file";
    import VideoIcon from "@lucide/svelte/icons/video";
    import MusicIcon from "@lucide/svelte/icons/music";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import XIcon from "@lucide/svelte/icons/x";
    import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
    import ZoomOutIcon from "@lucide/svelte/icons/zoom-out";
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

    let { data } = $props();

    const media = $derived(data?.media ?? []);
    const byType = $derived(data?.byType ?? {});

    let lightbox = $state<{ url: string; type: string } | null>(null);

    // Lightbox zoom/pan
    let zoom = $state(1);
    let panX = $state(0);
    let panY = $state(0);
    let isPanning = $state(false);
    let panStart = $state({ x: 0, y: 0 });
    let panAnchor = $state({ x: 0, y: 0 });

    function openLightbox(url: string, type: string) {
        lightbox = { url, type };
        zoom = 1;
        panX = 0;
        panY = 0;
    }

    function closeLightbox() {
        lightbox = null;
    }

    function typeIcon(mimeType: string) {
        const main = mimeType.split("/")[0];
        switch (main) {
            case "image":
                return ImageIcon;
            case "video":
                return VideoIcon;
            case "audio":
                return MusicIcon;
            default:
                return FileIcon;
        }
    }

    function typeLabel(group: string): string {
        switch (group) {
            case "image":
                return "Images";
            case "video":
                return "Videos";
            case "audio":
                return "Audio";
            default:
                return "Files";
        }
    }

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    function entityLink(entityType: string, entityId: string): string {
        const projectSlug = $page.params.project;
        return `/${projectSlug}/layers?layer=${encodeURIComponent(entityType)}&highlight=${encodeURIComponent(entityId)}`;
    }

    function entityLabel(entityType: string): string {
        return entityType.replace(/_/g, " ");
    }

    function isImage(mimeType: string) {
        return mimeType.startsWith("image/");
    }
    function isVideo(mimeType: string) {
        return mimeType.startsWith("video/");
    }

    const mediaList = $derived(
        media.filter(
            (m: any) =>
                m.media_type.startsWith("image/") ||
                m.media_type.startsWith("video/"),
        ),
    );

    function navigateMedia(direction: 1 | -1) {
        if (!lightbox || mediaList.length === 0) return;
        const idx = mediaList.findIndex((m: any) => m.url === lightbox!.url);
        if (idx === -1) return;
        const next = (idx + direction + mediaList.length) % mediaList.length;
        const m = mediaList[next];
        openLightbox(m.url, m.media_type);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!lightbox) return;
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowLeft") navigateMedia(-1);
        if (e.key === "ArrowRight") navigateMedia(1);
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.5 : 1 / 1.5;
        const newZoom = Math.min(Math.max(zoom * delta, 0.25), 5);
        if (newZoom <= 1) {
            panX = 0;
            panY = 0;
        }
        zoom = newZoom;
    }

    function handlePointerDown(e: PointerEvent) {
        if (zoom <= 1) return;
        e.preventDefault();
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        panAnchor = { x: panX, y: panY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
        if (!isPanning) return;
        e.preventDefault();
        panX = panAnchor.x + (e.clientX - panStart.x);
        panY = panAnchor.y + (e.clientY - panStart.y);
    }

    function handlePointerUp(e: PointerEvent) {
        if (!isPanning) return;
        e.preventDefault();
        isPanning = false;
    }

    function handleDoubleClick() {
        zoom = 1;
        panX = 0;
        panY = 0;
    }
</script>

<svelte:head>
    <title>Media — {$page.data?.project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex flex-col h-full px-6 py-4">
    <div class="shrink-0 mb-4">
        <div class="flex items-center gap-2.5">
            <ImageIcon class="size-5 text-muted-foreground" />
            <h1 class="text-xl font-bold tracking-tight text-foreground">
                Media
            </h1>
        </div>
        <p class="mt-0.5 text-sm text-muted-foreground">
            {media.length}
            {media.length === 1 ? "file" : "files"}
            {#if byType.image}
                · {byType.image.length} images{/if}
            {#if byType.video}
                · {byType.video.length} videos{/if}
            {#if byType.audio}
                · {byType.audio.length} audio{/if}
        </p>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
        {#if media.length === 0}
            <div
                class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20"
            >
                <ImageIcon class="size-10 text-muted-foreground/30 mb-3" />
                <p class="text-sm text-muted-foreground mb-1">No media yet</p>
                <p class="text-xs text-muted-foreground max-w-sm text-center">
                    Push data with media attachments to see them here.
                </p>
            </div>
        {:else}
            {#each Object.entries(byType) as [group, items]}
                <div class="mb-8">
                    <h2 class="text-sm font-semibold text-foreground mb-4">
                        {typeLabel(group)}
                        <span class="ml-1.5 font-normal text-muted-foreground"
                            >({items.length})</span
                        >
                    </h2>
                    <div
                        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                    >
                        {#each items as item}
                            <div
                                class="rounded-lg border bg-card overflow-hidden group"
                            >
                                {#if isImage(item.media_type)}
                                    <button
                                        onclick={() =>
                                            openLightbox(
                                                item.url,
                                                item.media_type,
                                            )}
                                        class="aspect-square bg-secondary w-full cursor-pointer overflow-hidden"
                                    >
                                        <img
                                            src={item.url}
                                            alt=""
                                            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    </button>
                                {:else if isVideo(item.media_type)}
                                    <div
                                        class="aspect-square bg-secondary flex items-center justify-center"
                                    >
                                        <video
                                            src={item.url}
                                            controls
                                            preload="metadata"
                                            class="w-full h-full object-cover"
                                        />
                                    </div>
                                {:else}
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        class="aspect-square bg-secondary flex items-center justify-center no-underline"
                                    >
                                        <svelte:component
                                            this={typeIcon(item.media_type)}
                                            class="size-8 text-muted-foreground"
                                        />
                                    </a>
                                {/if}

                                <div class="p-3">
                                    <div
                                        class="flex items-center justify-between gap-2 mb-2"
                                    >
                                        <span
                                            class="text-[10px] font-mono text-muted-foreground select-all"
                                            >{item.hash.slice(0, 10)}</span
                                        >
                                        <span
                                            class="text-[10px] text-muted-foreground"
                                            >{formatBytes(item.file_size)}</span
                                        >
                                    </div>
                                    {#if item.entities.length > 0}
                                        <div class="flex flex-col gap-1">
                                            <span
                                                class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
                                                >Linked entities</span
                                            >
                                            {#each item.entities as entity}
                                                <a
                                                    href={entityLink(
                                                        entity.entity_type,
                                                        entity.entity_id,
                                                    )}
                                                    class="flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 no-underline group/link"
                                                >
                                                    <span class="truncate"
                                                        >{entityLabel(
                                                            entity.entity_type,
                                                        )}</span
                                                    >
                                                    <span
                                                        class="font-mono text-[10px] text-muted-foreground shrink-0"
                                                        >{entity.entity_id}</span
                                                    >
                                                    <ExternalLinkIcon
                                                        class="size-2.5 shrink-0 text-muted-foreground opacity-0 group-hover/link:opacity-100 transition-opacity"
                                                    />
                                                </a>
                                            {/each}
                                        </div>
                                    {:else}
                                        <p
                                            class="text-[10px] italic text-muted-foreground"
                                        >
                                            No entities linked
                                        </p>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<!-- Lightbox -->
{#if lightbox}
    <button
        class="fixed inset-0 z-50 bg-black/80 cursor-pointer"
        onclick={closeLightbox}
        aria-label="Close"
    ></button>
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none"
    >
        <!-- Top bar -->
        <div
            class="absolute top-0 left-0 right-0 flex items-center justify-between px-4 h-12 pointer-events-auto"
        >
            <div class="flex items-center gap-1">
                {#if isImage(lightbox.type)}
                    <button
                        onclick={() => {
                            zoom = Math.min(zoom * 1.5, 5);
                            panX = 0;
                            panY = 0;
                        }}
                        class="flex items-center justify-center size-9 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        title="Zoom in"
                    >
                        <ZoomInIcon class="size-4" />
                    </button>
                    <button
                        onclick={() => {
                            const nz = Math.max(zoom / 1.5, 0.25);
                            if (nz <= 1) {
                                panX = 0;
                                panY = 0;
                            }
                            zoom = nz;
                        }}
                        class="flex items-center justify-center size-9 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        title="Zoom out"
                    >
                        <ZoomOutIcon class="size-4" />
                    </button>
                    <span class="text-xs text-white/40 ml-1"
                        >{Math.round(zoom * 100)}%</span
                    >
                {/if}
            </div>
            <button
                onclick={closeLightbox}
                class="flex items-center justify-center size-9 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="Close (Esc)"
            >
                <XIcon class="size-5" />
            </button>
        </div>

        <!-- Nav arrows -->
        {#if mediaList.length > 1}
            <button
                onclick={() => navigateMedia(-1)}
                class="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-10 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors pointer-events-auto"
                title="Previous (←)"
            >
                <ChevronLeftIcon class="size-5" />
            </button>
            <button
                onclick={() => navigateMedia(1)}
                class="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-10 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-colors pointer-events-auto"
                title="Next (→)"
            >
                <ChevronRightIcon class="size-5" />
            </button>
        {/if}

        {#if isImage(lightbox.type)}
            <img
                src={lightbox.url}
                alt=""
                draggable="false"
                class="max-h-full max-w-full object-contain rounded-lg pointer-events-auto select-none"
                class:cursor-grab={zoom > 1 && !isPanning}
                class:cursor-grabbing={zoom > 1 && isPanning}
                style="transform: scale({zoom}) translate({panX /
                    zoom}px, {panY / zoom}px)"
                onwheel={handleWheel}
                onpointerdown={handlePointerDown}
                onpointermove={handlePointerMove}
                onpointerup={handlePointerUp}
                onpointercancel={handlePointerUp}
                ondblclick={handleDoubleClick}
                oncontextmenu={(e) => zoom > 1 && e.preventDefault()}
            />
        {:else if isVideo(lightbox.type)}
            <video
                src={lightbox.url}
                controls
                autoplay
                class="max-h-full max-w-full rounded-lg pointer-events-auto"
            />
        {:else}
            <div class="bg-card rounded-lg p-8 text-center pointer-events-auto">
                <p class="text-sm text-muted-foreground mb-4">
                    Preview not available for this file type.
                </p>
                <a
                    href={lightbox.url}
                    target="_blank"
                    class="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors no-underline"
                >
                    <ExternalLinkIcon class="size-4" /> Open file
                </a>
            </div>
        {/if}
    </div>
{/if}
