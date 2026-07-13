<script lang="ts">
    import { page } from "$app/stores";
    import ArchiveIcon from "@lucide/svelte/icons/archive";
    import ImageIcon from "@lucide/svelte/icons/image";
    import ImageOffIcon from "@lucide/svelte/icons/image-off";
    import VideoIcon from "@lucide/svelte/icons/video";
    import MusicIcon from "@lucide/svelte/icons/music";
    import FileTextIcon from "@lucide/svelte/icons/file-text";
    import FileWarningIcon from "@lucide/svelte/icons/file-warning";
    import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
    import XIcon from "@lucide/svelte/icons/x";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import { onMount } from "svelte";
    import { entityLayersHref } from "$lib/project/entityLink";
    import MediaUpload from "$lib/components/artefacts/MediaUpload.svelte";

    let { data } = $props();

    const accessToken = $derived(data?.accessToken ?? "");
    const canUpload = $derived(
        ["owner", "admin", "collaborator"].includes(
            String((data as any)?.role ?? "viewer"),
        ),
    );

    interface MediaItem {
        hash: string;
        media_type: string;
        file_size: number;
        url: string;
        entities: Array<{ entity_type: string; entity_id: string }>;
    }

    type TypeFilter = "all" | "image" | "video" | "audio" | "pdf" | "other";

    let items = $state<MediaItem[]>([]);
    let totalItems = $state(0);
    let typeCounts = $state<Record<string, number>>({});
    let loading = $state(false);
    let hasMore = $state(true);
    let error = $state("");
    let offset = $state(0);
    const LIMIT = 50;

    let sentinel = $state<HTMLDivElement>();
    let typeFilter = $state<TypeFilter>("all");
    let selectedHash = $state<string | null>(null);
    let viewerOpen = $state(false);

    let loadedImages = $state<Set<string>>(new Set());
    let failedImages = $state<Set<string>>(new Set());
    let missingCount = $state(0);
    let integrityChecked = $state(false);

    function onImageLoad(hash: string) {
        loadedImages = new Set([...loadedImages, hash]);
    }
    function onImageError(hash: string) {
        failedImages = new Set([...failedImages, hash]);
    }

    async function reloadShelf() {
        items = [];
        offset = 0;
        hasMore = true;
        totalItems = 0;
        await loadMore();
        await checkIntegrity();
    }

    async function checkIntegrity() {
        try {
            const slug = $page.params.project;
            const res = await fetch(
                `/api/v1/projects/${slug}/media/integrity`,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : {},
            );
            if (!res.ok) return;
            const body = await res.json();
            missingCount = Array.isArray(body.missing_blobs)
                ? body.missing_blobs.length
                : 0;
            integrityChecked = true;
        } catch {
            /* advisory */
        }
    }

    function mediaUrl(item: MediaItem): string {
        return (
            item.url +
            (accessToken ? `?token=${encodeURIComponent(accessToken)}` : "")
        );
    }

    function kindOf(item: MediaItem): TypeFilter {
        if (item.media_type === "application/pdf") return "pdf";
        const t = item.media_type.split("/")[0] || "other";
        if (t === "image" || t === "video" || t === "audio") return t;
        return "other";
    }

    function isPdf(item: MediaItem): boolean {
        return item.media_type === "application/pdf";
    }

    const filtered = $derived(
        typeFilter === "all"
            ? items
            : items.filter((it) => kindOf(it) === typeFilter),
    );

    const selected = $derived(
        selectedHash
            ? (items.find((it) => it.hash === selectedHash) ?? null)
            : null,
    );

    const imageItems = $derived(
        filtered.filter((it) => it.media_type.startsWith("image/")),
    );

    const viewerIdx = $derived(
        selected && selected.media_type.startsWith("image/")
            ? imageItems.findIndex((it) => it.hash === selected.hash)
            : -1,
    );

    function selectItem(item: MediaItem) {
        selectedHash = item.hash;
    }

    function openViewer() {
        if (!selected?.media_type.startsWith("image/")) return;
        viewerOpen = true;
    }

    function closeViewer() {
        viewerOpen = false;
    }

    function prevImage() {
        if (viewerIdx <= 0) return;
        selectedHash = imageItems[viewerIdx - 1].hash;
    }

    function nextImage() {
        if (viewerIdx < 0 || viewerIdx >= imageItems.length - 1) return;
        selectedHash = imageItems[viewerIdx + 1].hash;
    }

    function onKeydown(e: KeyboardEvent) {
        if (viewerOpen) {
            if (e.key === "Escape") closeViewer();
            if (e.key === "ArrowLeft") prevImage();
            if (e.key === "ArrowRight") nextImage();
            return;
        }
        if (e.key === "Escape") selectedHash = null;
    }

    async function loadMore() {
        if (loading || !hasMore) return;
        loading = true;
        error = "";
        try {
            const slug = $page.params.project;
            const res = await fetch(
                `/api/v1/projects/${slug}/media?offset=${offset}&limit=${LIMIT}`,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : {},
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const contentRange = res.headers.get("Content-Range");
            if (contentRange) {
                const total = contentRange.split("/")[1];
                if (total && total !== "*") totalItems = parseInt(total, 10);
            }
            const body = await res.json();
            const batch: MediaItem[] = body.items ?? body;
            if (body.counts) typeCounts = body.counts;
            items = [...items, ...batch];
            offset += batch.length;
            if (batch.length < LIMIT) hasMore = false;
        } catch (e: any) {
            error = e?.message ?? "Failed to load";
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        loadMore();
        checkIntegrity();
    });

    $effect(() => {
        if (!sentinel || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore();
            },
            { rootMargin: "200px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    });

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    function entityLink(entityType: string, entityId: string): string {
        return entityLayersHref($page.params.project, {
            layer: entityType,
            highlight: entityId,
        });
    }

    function entityLabel(entityType: string): string {
        return entityType.replace(/_/g, " ");
    }

    const filterTabs: { id: TypeFilter; label: string }[] = [
        { id: "all", label: "All" },
        { id: "image", label: "Photos" },
        { id: "pdf", label: "Reports" },
        { id: "video", label: "Videos" },
        { id: "audio", label: "Audio" },
        { id: "other", label: "Other" },
    ];

    function filterCount(id: TypeFilter): number | null {
        if (id === "all") return totalItems || items.length || null;
        if (id === "pdf") {
            return typeCounts.pdf != null ? typeCounts.pdf : null;
        }
        if (id === "other") {
            const app = typeCounts.application ?? 0;
            const pdf = typeCounts.pdf ?? 0;
            const n = app - pdf;
            return n > 0 ? n : null;
        }
        const n = typeCounts[id];
        return n != null ? n : null;
    }
</script>

<svelte:head>
    <title>Artefacts — {$page.data?.project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="flex flex-col h-full px-6 py-4">
    <div class="shrink-0 mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
            <div class="flex items-center gap-2.5">
                <ArchiveIcon class="size-5 text-muted-foreground" />
                <h1 class="text-xl font-bold tracking-tight text-foreground">
                    Artefacts
                </h1>
            </div>
            <p class="mt-0.5 text-sm text-muted-foreground">
                Photos, reports, and other documentary media linked to entities
                {#if totalItems || items.length}
                    · {totalItems || items.length} item{(totalItems ||
                        items.length) !== 1
                        ? "s"
                        : ""}
                {/if}
            </p>
        </div>

        <div
            class="flex items-center rounded-md border border-border overflow-hidden"
        >
            {#each filterTabs as tab}
                {@const count = filterCount(tab.id)}
                <button
                    type="button"
                    onclick={() => (typeFilter = tab.id)}
                    class="px-2.5 py-1 text-xs border-l border-border first:border-l-0 transition-colors {typeFilter ===
                    tab.id
                        ? 'bg-secondary text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'}"
                >
                    {tab.label}{#if count != null}<span
                            class="text-muted-foreground/70"
                        >
                            {count}</span
                        >{/if}
                </button>
            {/each}
        </div>
    </div>

    {#if integrityChecked && missingCount > 0}
        <div
            class="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
        >
            <AlertTriangleIcon class="size-4 shrink-0 text-amber-600 mt-0.5" />
            <p>
                <span class="font-medium">{missingCount} media file{missingCount === 1 ? "" : "s"}</span>
                indexed but missing on disk. Re-push media or restore blobs.
            </p>
        </div>
    {/if}

    {#if canUpload}
        <div class="mb-4">
            <MediaUpload
                projectSlug={$page.params.project}
                {accessToken}
                onUploaded={reloadShelf}
            />
        </div>
    {/if}

    <div
        class="flex-1 min-h-0 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-stretch"
    >
        <div class="min-h-0 overflow-y-auto">
            {#if items.length === 0 && !loading}
                <div class="flex items-center justify-center h-64">
                    <div class="text-center max-w-sm">
                        <ArchiveIcon
                            class="mx-auto mb-3 size-8 text-muted-foreground/40"
                        />
                        <h2 class="text-base font-semibold text-foreground mb-1">
                            No artefacts yet
                        </h2>
                        <p class="text-sm text-muted-foreground">
                            Push data with photos or grey literature PDFs to see
                            them here, linked to the entities they document.
                        </p>
                    </div>
                </div>
            {:else if filtered.length === 0 && !loading}
                <div class="py-16 text-center text-sm text-muted-foreground">
                    No {typeFilter === "all" ? "" : typeFilter + " "}items
                    loaded yet.
                </div>
            {:else}
                <div
                    class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-1.5"
                >
                    {#each filtered as item}
                        {@const isImage = item.media_type.startsWith("image/")}
                        {@const isVideo = item.media_type.startsWith("video/")}
                        {@const isAudio = item.media_type.startsWith("audio/")}
                        {@const pdf = isPdf(item)}
                        {@const imgLoaded = loadedImages.has(item.hash)}
                        {@const imgFailed = failedImages.has(item.hash)}
                        {@const active = selectedHash === item.hash}
                        <button
                            type="button"
                            onclick={() => selectItem(item)}
                            ondblclick={() => {
                                selectItem(item);
                                if (isImage) openViewer();
                            }}
                            class="group relative aspect-square overflow-hidden rounded-md bg-secondary/60 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring {active
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                                : 'hover:ring-1 hover:ring-border'}"
                            title={item.entities[0]
                                ? `${entityLabel(item.entities[0].entity_type)} · ${item.entities[0].entity_id}`
                                : item.media_type}
                        >
                            {#if isImage}
                                {#if !imgLoaded && !imgFailed}
                                    <div
                                        class="absolute inset-0 animate-pulse bg-secondary"
                                    ></div>
                                {/if}
                                {#if imgFailed}
                                    <div
                                        class="absolute inset-0 flex items-center justify-center"
                                    >
                                        <ImageOffIcon
                                            class="size-6 text-muted-foreground/40"
                                        />
                                    </div>
                                {/if}
                                <img
                                    src={mediaUrl(item)}
                                    alt=""
                                    class="h-full w-full object-cover {imgLoaded
                                        ? 'opacity-100'
                                        : 'opacity-0'} transition-opacity duration-200"
                                    loading="lazy"
                                    onload={() => onImageLoad(item.hash)}
                                    onerror={() => onImageError(item.hash)}
                                />
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
                                        <span class="text-[10px] uppercase tracking-wide opacity-70">PDF</span>
                                    {:else}
                                        <FileWarningIcon
                                            class="size-6 opacity-70"
                                        />
                                    {/if}
                                </div>
                            {/if}
                            {#if item.entities.length > 0}
                                <span
                                    class="pointer-events-none absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 text-[10px] text-foreground/80 opacity-0 transition-opacity group-hover:opacity-100 {active
                                        ? 'opacity-100'
                                        : ''}"
                                >
                                    {entityLabel(item.entities[0].entity_type)}
                                </span>
                            {/if}
                        </button>
                    {/each}
                </div>

                {#if hasMore}
                    <div
                        bind:this={sentinel}
                        class="py-8 flex items-center justify-center"
                    >
                        {#if loading}
                            <p class="text-sm text-muted-foreground animate-pulse">
                                Loading…
                            </p>
                        {/if}
                    </div>
                {:else if items.length > 0}
                    <p class="py-6 text-center text-xs text-muted-foreground">
                        {filtered.length} shown
                    </p>
                {/if}
            {/if}

            {#if error}
                <p class="py-4 text-center text-sm text-destructive">{error}</p>
            {/if}
        </div>

        <!-- Detail panel -->
        <aside
            class="hidden lg:flex min-h-0 flex-col rounded-lg border border-border bg-secondary/20 overflow-hidden"
        >
            {#if selected}
                {@const isImage = selected.media_type.startsWith("image/")}
                {@const isVideo = selected.media_type.startsWith("video/")}
                {@const isAudio = selected.media_type.startsWith("audio/")}
                {@const pdf = isPdf(selected)}
                <div class="relative aspect-[4/3] shrink-0 bg-secondary/40">
                    {#if isImage}
                        <img
                            src={mediaUrl(selected)}
                            alt=""
                            class="h-full w-full object-contain"
                        />
                        <button
                            type="button"
                            onclick={openViewer}
                            class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-border glass-panel px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Maximize2Icon class="size-3" />
                            Expand
                        </button>
                    {:else if isVideo}
                        <video
                            src={mediaUrl(selected)}
                            controls
                            class="h-full w-full object-contain"
                        ></video>
                    {:else if isAudio}
                        <div
                            class="flex h-full flex-col items-center justify-center gap-3 px-4"
                        >
                            <MusicIcon
                                class="size-8 text-muted-foreground/50"
                            />
                            <audio
                                src={mediaUrl(selected)}
                                controls
                                class="w-full"
                            ></audio>
                        </div>
                    {:else if pdf}
                        <iframe
                            title="PDF preview"
                            src={mediaUrl(selected)}
                            class="h-full w-full border-0 bg-background"
                        ></iframe>
                    {:else}
                        <div
                            class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
                        >
                            <FileWarningIcon class="size-8 opacity-50" />
                            <span class="text-xs">{selected.media_type}</span>
                        </div>
                    {/if}
                </div>

                <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
                    <div>
                        <p
                            class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1"
                        >
                            Linked entities
                        </p>
                        {#if selected.entities.length === 0}
                            <p class="text-xs text-muted-foreground italic">
                                Not linked to an entity
                            </p>
                        {:else}
                            <ul class="space-y-1">
                                {#each selected.entities as entity}
                                    <li>
                                        <a
                                            href={entityLink(
                                                entity.entity_type,
                                                entity.entity_id,
                                            )}
                                            class="group flex items-center gap-2 rounded-md px-2 py-1.5 -mx-1 text-xs no-underline hover:bg-accent/60 transition-colors"
                                        >
                                            <MapPinIcon
                                                class="size-3.5 shrink-0 text-muted-foreground"
                                            />
                                            <span
                                                class="min-w-0 flex-1 truncate text-foreground"
                                            >
                                                {entityLabel(
                                                    entity.entity_type,
                                                )}
                                            </span>
                                            <span
                                                class="font-mono text-[10px] text-muted-foreground truncate max-w-[40%]"
                                            >
                                                {entity.entity_id}
                                            </span>
                                            <span
                                                class="shrink-0 text-[10px] text-primary opacity-0 group-hover:opacity-100"
                                            >
                                                Layers
                                            </span>
                                        </a>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <div
                        class="border-t border-border pt-3 text-[11px] text-muted-foreground space-y-1"
                    >
                        <p>
                            <span class="text-foreground/70"
                                >{selected.media_type}</span
                            >
                            · {formatBytes(selected.file_size)}
                        </p>
                        {#if isPdf(selected)}
                            <p>
                                <a
                                    href={mediaUrl(selected)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-primary hover:underline"
                                >
                                    Open PDF in new tab
                                </a>
                            </p>
                        {/if}
                        <p class="font-mono break-all opacity-70">
                            {selected.hash}
                        </p>
                    </div>
                </div>
            {:else}
                <div
                    class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
                >
                    <ArchiveIcon class="size-7 text-muted-foreground/35" />
                    <p class="text-sm text-muted-foreground">
                        Select an item to see linked entities
                    </p>
                </div>
            {/if}
        </aside>
    </div>

    <!-- Mobile detail sheet -->
    {#if selected}
        <div
            class="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border glass-dock p-4 max-h-[45vh] overflow-y-auto"
        >
            <div class="flex items-start justify-between gap-3 mb-3">
                <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground truncate">
                        {selected.entities[0]
                            ? entityLabel(selected.entities[0].entity_type)
                            : selected.media_type}
                    </p>
                    <p class="text-[11px] text-muted-foreground">
                        {formatBytes(selected.file_size)}
                    </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    {#if selected.media_type.startsWith("image/")}
                        <button
                            type="button"
                            onclick={openViewer}
                            class="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                            Expand
                        </button>
                    {/if}
                    <button
                        type="button"
                        onclick={() => (selectedHash = null)}
                        class="rounded-md p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Close"
                    >
                        <XIcon class="size-4" />
                    </button>
                </div>
            </div>
            {#if selected.entities.length > 0}
                <ul class="space-y-1">
                    {#each selected.entities as entity}
                        <li>
                            <a
                                href={entityLink(
                                    entity.entity_type,
                                    entity.entity_id,
                                )}
                                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs no-underline hover:bg-accent/60"
                            >
                                <MapPinIcon
                                    class="size-3.5 text-muted-foreground"
                                />
                                <span class="truncate"
                                    >{entityLabel(entity.entity_type)}</span
                                >
                                <span
                                    class="ml-auto font-mono text-[10px] text-muted-foreground"
                                    >{entity.entity_id}</span
                                >
                            </a>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    <!-- Quiet image viewer -->
    {#if viewerOpen && selected?.media_type.startsWith("image/")}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
            class="fixed inset-0 z-1100 glass-overlay flex flex-col"
            onclick={closeViewer}
            role="dialog"
            tabindex="-1"
        >
            <div
                class="flex items-center justify-between gap-3 px-4 py-3 border-b border-border"
                onclick={(e) => e.stopPropagation()}
            >
                <p class="text-sm text-muted-foreground tabular-nums">
                    {#if viewerIdx >= 0}
                        {viewerIdx + 1} / {imageItems.length}
                    {/if}
                </p>
                <div class="flex items-center gap-1">
                    {#if selected.entities[0]}
                        <a
                            href={entityLink(
                                selected.entities[0].entity_type,
                                selected.entities[0].entity_id,
                            )}
                            class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs no-underline text-foreground hover:bg-secondary transition-colors"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <MapPinIcon class="size-3.5" />
                            Open in Layers
                        </a>
                    {/if}
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
                class="relative flex-1 flex items-center justify-center p-4 min-h-0"
                onclick={(e) => e.stopPropagation()}
            >
                {#if viewerIdx > 0}
                    <button
                        type="button"
                        class="absolute left-3 top-1/2 -translate-y-1/2 rounded-md border border-border glass-panel p-2 text-muted-foreground hover:text-foreground"
                        onclick={prevImage}
                        aria-label="Previous"
                    >
                        <ChevronLeft class="size-5" />
                    </button>
                {/if}
                <img
                    src={mediaUrl(selected)}
                    alt=""
                    class="max-h-full max-w-full object-contain"
                />
                {#if viewerIdx >= 0 && viewerIdx < imageItems.length - 1}
                    <button
                        type="button"
                        class="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border glass-panel p-2 text-muted-foreground hover:text-foreground"
                        onclick={nextImage}
                        aria-label="Next"
                    >
                        <ChevronRight class="size-5" />
                    </button>
                {/if}
            </div>

            {#if selected.entities.length > 0}
                <div
                    class="border-t border-border px-4 py-3 flex flex-wrap gap-2"
                    onclick={(e) => e.stopPropagation()}
                >
                    {#each selected.entities as entity}
                        <a
                            href={entityLink(
                                entity.entity_type,
                                entity.entity_id,
                            )}
                            class="inline-flex items-center gap-1.5 rounded-md bg-secondary/80 px-2 py-1 text-[11px] no-underline text-foreground hover:bg-secondary"
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
    {/if}
</div>
