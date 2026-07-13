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
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import CheckIcon from "@lucide/svelte/icons/check";
    import SparklesIcon from "@lucide/svelte/icons/sparkles";
    import { onMount } from "svelte";
    import { entityLayersHref } from "$lib/project/entityLink";
    import MediaUpload from "$lib/components/artefacts/MediaUpload.svelte";
    import { goto } from "$app/navigation";
    import {
        bboxFromGeoJSON,
        formatBBox,
        formatDateSpan,
    } from "$lib/search/params";

    let { data } = $props();

    const accessToken = $derived(data?.accessToken ?? "");
    const canUpload = $derived(
        ["owner", "admin", "collaborator"].includes(
            String((data as any)?.role ?? "viewer"),
        ),
    );
    const projectMeta = $derived(
        ($page.data?.project ?? null) as {
            date_start?: number | null;
            date_end?: number | null;
            bbox?: string | null;
            tags_manual?: string[];
            tags_auto?: string[];
        } | null,
    );
    const projectPeriod = $derived.by(() => {
        const p = projectMeta;
        if (!p) return null;
        if (p.date_start == null && p.date_end == null) return null;
        return {
            dateFrom: p.date_start ?? null,
            dateTo: p.date_end ?? null,
        };
    });
    const projectRegion = $derived(
        bboxFromGeoJSON(projectMeta?.bbox ?? null),
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
    let hashCopied = $state(false);
    let similarItems = $state<
        Array<{
            hash: string;
            media_type: string;
            url: string;
            project_slug: string;
            project_title: string;
            entity_type?: string;
            entity_id?: string;
            distance: number;
        }>
    >([]);
    let similarStatus = $state("");
    let similarLoading = $state(false);
    let similarRefineOpen = $state(false);
    let similarSamePeriod = $state(false);
    let similarSameRegion = $state(false);
    let similarTag = $state("");
    let similarTagInput = $state("");
    let similarTagSuggestions = $state<string[]>([]);
    let similarFetched = $state(false);

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

    let loadGen = 0;

    async function reloadShelf(opts?: { preferType?: TypeFilter }) {
        if (opts?.preferType) typeFilter = opts.preferType;
        await resetAndLoad();
        await checkIntegrity();
    }

    async function resetAndLoad() {
        const gen = ++loadGen;
        items = [];
        offset = 0;
        hasMore = true;
        loading = false;
        await loadMore(gen);
    }

    function setTypeFilter(id: TypeFilter) {
        if (typeFilter === id) return;
        typeFilter = id;
        resetAndLoad();
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

    function mediaUrl(item: MediaItem, opts?: { pdfFit?: boolean }): string {
        const base =
            item.url +
            (accessToken ? `?token=${encodeURIComponent(accessToken)}` : "");
        if (opts?.pdfFit && item.media_type === "application/pdf") {
            // Fit page width in the embedded viewer; hide chrome where supported.
            return `${base}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
        }
        return base;
    }

    function isPdf(item: MediaItem): boolean {
        return item.media_type === "application/pdf";
    }

    function linkedEntities(item: MediaItem) {
        return item.entities.filter(
            (e) =>
                e.entity_id.trim() !== "" &&
                e.entity_type.trim() !== "" &&
                e.entity_type !== "unknown",
        );
    }

    function shortHash(hash: string): string {
        return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
    }

    async function copyHash(hash: string) {
        try {
            await navigator.clipboard.writeText(hash);
            hashCopied = true;
            setTimeout(() => (hashCopied = false), 1500);
        } catch {
            /* ignore */
        }
    }

    // Server already filters by type; keep a local alias for the grid.
    const filtered = $derived(items);

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
        hashCopied = false;
        similarItems = [];
        similarStatus = "";
        similarFetched = false;
        similarRefineOpen = false;
    }

    function similarQueryParams(): URLSearchParams {
        const p = new URLSearchParams({ limit: "12" });
        if (similarSamePeriod && projectPeriod) {
            if (projectPeriod.dateFrom != null) {
                p.set("date_from", String(projectPeriod.dateFrom));
            }
            if (projectPeriod.dateTo != null) {
                p.set("date_to", String(projectPeriod.dateTo));
            }
        }
        if (similarSameRegion && projectRegion) {
            p.set("bbox", formatBBox(projectRegion));
        }
        const tag = similarTag.trim();
        if (tag) p.set("tag", tag);
        return p;
    }

    async function findSimilar() {
        if (!selected) return;
        similarLoading = true;
        similarStatus = "";
        similarItems = [];
        try {
            const qs = similarQueryParams().toString();
            const res = await fetch(
                `/api/v1/media/${selected.hash}/similar?${qs}`,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : {},
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = await res.json();
            similarItems = body.items ?? [];
            similarFetched = true;
            if (body.status === "pending_embedding") {
                similarStatus = "Embedding still pending — try again shortly";
            } else if (similarItems.length === 0) {
                similarStatus = "No similar photos yet";
            }
        } catch (e: any) {
            similarStatus = e?.message ?? "Similar search failed";
            similarFetched = true;
        } finally {
            similarLoading = false;
        }
    }

    function refetchSimilarIfShown() {
        if (similarFetched || similarItems.length > 0 || similarStatus) {
            findSimilar();
        }
    }

    function setSamePeriod(on: boolean) {
        similarSamePeriod = on;
        refetchSimilarIfShown();
    }

    function setSameRegion(on: boolean) {
        similarSameRegion = on;
        refetchSimilarIfShown();
    }

    function applySimilarTag(tag: string) {
        similarTag = tag.trim();
        similarTagInput = "";
        similarTagSuggestions = [];
        refetchSimilarIfShown();
    }

    function clearSimilarTag() {
        similarTag = "";
        similarTagInput = "";
        similarTagSuggestions = [];
        refetchSimilarIfShown();
    }

    let similarTagDebounce: ReturnType<typeof setTimeout> | undefined;
    async function onSimilarTagInput() {
        clearTimeout(similarTagDebounce);
        const q = similarTagInput.trim();
        if (q.length < 1) {
            similarTagSuggestions = [];
            return;
        }
        similarTagDebounce = setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/v1/search/lexicon/tags?prefix=${encodeURIComponent(q)}&limit=8`,
                    accessToken
                        ? {
                              headers: {
                                  Authorization: `Bearer ${accessToken}`,
                              },
                          }
                        : {},
                );
                if (!res.ok) return;
                const body = await res.json();
                similarTagSuggestions = Array.isArray(body?.tags)
                    ? body.tags
                    : [];
            } catch {
                /* ignore */
            }
        }, 200);
    }

    const similarFilterChips = $derived.by(() => {
        const chips: string[] = [];
        if (similarSamePeriod && projectPeriod) {
            chips.push(
                formatDateSpan(projectPeriod.dateFrom, projectPeriod.dateTo) ??
                    "period",
            );
        }
        if (similarSameRegion && projectRegion) chips.push("region");
        if (similarTag.trim()) chips.push(`tag:${similarTag.trim()}`);
        return chips;
    });

    function openViewer() {
        if (!selected) return;
        if (
            !selected.media_type.startsWith("image/") &&
            !isPdf(selected)
        )
            return;
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

    async function loadMore(gen = loadGen) {
        if (loading || !hasMore || gen !== loadGen) return;
        loading = true;
        error = "";
        const filter = typeFilter;
        const at = offset;
        try {
            const slug = $page.params.project;
            const typeParam =
                filter !== "all" ? `&type=${encodeURIComponent(filter)}` : "";
            const res = await fetch(
                `/api/v1/projects/${slug}/media?offset=${at}&limit=${LIMIT}${typeParam}`,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : {},
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (gen !== loadGen) return;
            const contentRange = res.headers.get("Content-Range");
            if (contentRange) {
                const total = contentRange.split("/")[1];
                if (total && total !== "*") {
                    // All-tab total stays global via counts when filtered.
                    if (filter === "all") {
                        totalItems = parseInt(total, 10);
                    }
                }
            }
            const body = await res.json();
            const batch: MediaItem[] = body.items ?? body;
            if (body.counts) {
                typeCounts = body.counts;
                const image = body.counts.image ?? 0;
                const video = body.counts.video ?? 0;
                const audio = body.counts.audio ?? 0;
                const application = body.counts.application ?? 0;
                totalItems = image + video + audio + application;
            }
            items = [...items, ...batch];
            offset = at + batch.length;
            if (batch.length < LIMIT) hasMore = false;
        } catch (e: any) {
            if (gen === loadGen) error = e?.message ?? "Failed to load";
        } finally {
            if (gen === loadGen) loading = false;
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
    <div class="shrink-0 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
            <div class="flex items-center gap-2">
                <ArchiveIcon class="size-4 text-muted-foreground" />
                <h1 class="text-lg font-semibold tracking-tight text-foreground">
                    Artefacts
                </h1>
                {#if totalItems || items.length}
                    <span class="text-xs text-muted-foreground tabular-nums">
                        {totalItems || items.length}
                    </span>
                {/if}
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            {#if canUpload}
                <MediaUpload
                    projectSlug={$page.params.project}
                    {accessToken}
                    onUploaded={(info) => {
                        let prefer: TypeFilter | undefined;
                        if (info?.mediaType === "application/pdf") prefer = "pdf";
                        else if (info?.mediaType?.startsWith("image/"))
                            prefer = "image";
                        else if (info?.mediaType?.startsWith("video/"))
                            prefer = "video";
                        else if (info?.mediaType?.startsWith("audio/"))
                            prefer = "audio";
                        reloadShelf(
                            prefer ? { preferType: prefer } : undefined,
                        );
                    }}
                />
            {/if}
            <div
                class="flex items-center rounded-md border border-border overflow-hidden"
            >
                {#each filterTabs as tab}
                    {@const count = filterCount(tab.id)}
                    <button
                        type="button"
                        onclick={() => setTypeFilter(tab.id)}
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border-l border-border first:border-l-0 transition-colors {typeFilter ===
                        tab.id
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'}"
                    >
                        <span>{tab.label}</span>
                        {#if count != null}
                            <span class="tabular-nums text-muted-foreground/80"
                                >{count}</span
                            >
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    </div>

    {#if integrityChecked && missingCount > 0}
        <div
            class="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
        >
            <AlertTriangleIcon class="size-4 shrink-0 text-amber-600 mt-0.5" />
            <p>
                <span class="font-medium"
                    >{missingCount} media file{missingCount === 1
                        ? ""
                        : "s"}</span
                >
                indexed but missing on disk. Re-push media or restore blobs.
            </p>
        </div>
    {/if}

    <div
        class="flex-1 min-h-0 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-stretch"
    >
        <div class="min-h-0 overflow-y-auto">
            {#if loading && items.length === 0}
                <div
                    class="flex items-center justify-center h-64 text-sm text-muted-foreground"
                >
                    Loading…
                </div>
            {:else if items.length === 0}
                <div class="flex items-center justify-center h-64">
                    <div class="text-center max-w-sm">
                        <ArchiveIcon
                            class="mx-auto mb-3 size-8 text-muted-foreground/40"
                        />
                        <h2 class="text-base font-semibold text-foreground mb-1">
                            {typeFilter === "all"
                                ? "No artefacts yet"
                                : typeFilter === "pdf"
                                  ? "No reports yet"
                                  : typeFilter === "image"
                                    ? "No photos yet"
                                    : `No ${typeFilter} yet`}
                        </h2>
                        <p class="text-sm text-muted-foreground">
                            {typeFilter === "all"
                                ? "Push data with photos or grey literature PDFs to see them here, linked to the entities they document."
                                : "Try another filter, or upload files that match this type."}
                        </p>
                    </div>
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
            class="hidden lg:flex min-h-0 flex-col rounded-lg border border-border bg-secondary/15 overflow-hidden"
        >
            {#if selected}
                {@const isImage = selected.media_type.startsWith("image/")}
                {@const isVideo = selected.media_type.startsWith("video/")}
                {@const isAudio = selected.media_type.startsWith("audio/")}
                {@const pdf = isPdf(selected)}
                {@const links = linkedEntities(selected)}

                <div
                    class="shrink-0 flex items-center justify-between gap-2 border-b border-border px-3 py-2"
                >
                    <div class="min-w-0">
                        <p class="text-xs font-medium text-foreground truncate">
                            {pdf
                                ? "Report"
                                : isImage
                                  ? "Photo"
                                  : isVideo
                                    ? "Video"
                                    : isAudio
                                      ? "Audio"
                                      : "File"}
                        </p>
                        <p class="text-[11px] text-muted-foreground truncate">
                            {formatBytes(selected.file_size)}
                        </p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        {#if pdf}
                            <a
                                href={mediaUrl(selected)}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground no-underline hover:text-foreground transition-colors"
                                title="Open in new tab"
                            >
                                <ExternalLinkIcon class="size-3" />
                                Open
                            </a>
                        {/if}
                        {#if isImage}
                            <button
                                type="button"
                                onclick={findSimilar}
                                disabled={similarLoading}
                                class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                                <SparklesIcon class="size-3" />
                                {similarLoading ? "…" : "Similar"}
                            </button>
                            <button
                                type="button"
                                onclick={() =>
                                    (similarRefineOpen = !similarRefineOpen)}
                                class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                title="Refine similar search"
                            >
                                Refine
                            </button>
                        {/if}
                        {#if isImage || pdf}
                            <button
                                type="button"
                                onclick={openViewer}
                                class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Maximize2Icon class="size-3" />
                                Expand
                            </button>
                        {/if}
                    </div>
                </div>

                <div
                    class="relative min-h-0 {pdf
                        ? 'flex-1'
                        : 'aspect-[4/3] shrink-0'} bg-neutral-900/90"
                >
                    {#if isImage}
                        <img
                            src={mediaUrl(selected)}
                            alt=""
                            class="h-full w-full object-contain"
                        />
                    {:else if isVideo}
                        <video
                            src={mediaUrl(selected)}
                            controls
                            class="h-full w-full object-contain"
                        ></video>
                    {:else if isAudio}
                        <div
                            class="flex h-full flex-col items-center justify-center gap-3 px-4 bg-secondary/40"
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
                            src={mediaUrl(selected, { pdfFit: true })}
                            class="absolute inset-0 h-full w-full border-0"
                        ></iframe>
                    {:else}
                        <div
                            class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground bg-secondary/40"
                        >
                            <FileWarningIcon class="size-8 opacity-50" />
                            <span class="text-xs">{selected.media_type}</span>
                        </div>
                    {/if}
                </div>

                <div class="shrink-0 border-t border-border p-3 space-y-3">
                    {#if isImage && similarRefineOpen}
                        <div class="space-y-2 rounded-md border border-border bg-secondary/30 p-2">
                            <p
                                class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                            >
                                Refine similar
                            </p>
                            <label
                                class="flex items-center gap-2 text-xs {!projectPeriod
                                    ? 'opacity-40'
                                    : ''}"
                            >
                                <input
                                    type="checkbox"
                                    checked={similarSamePeriod}
                                    disabled={!projectPeriod}
                                    onchange={(e) =>
                                        setSamePeriod(e.currentTarget.checked)}
                                />
                                Same period as this project
                                {#if projectPeriod}
                                    <span class="text-muted-foreground">
                                        ({formatDateSpan(
                                            projectPeriod.dateFrom,
                                            projectPeriod.dateTo,
                                        )})
                                    </span>
                                {/if}
                            </label>
                            <label
                                class="flex items-center gap-2 text-xs {!projectRegion
                                    ? 'opacity-40'
                                    : ''}"
                            >
                                <input
                                    type="checkbox"
                                    checked={similarSameRegion}
                                    disabled={!projectRegion}
                                    onchange={(e) =>
                                        setSameRegion(e.currentTarget.checked)}
                                />
                                Same region as this project
                            </label>
                            <div class="space-y-1">
                                {#if similarTag}
                                    <div class="flex items-center gap-1">
                                        <span
                                            class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px]"
                                        >
                                            {similarTag}
                                            <button
                                                type="button"
                                                class="text-muted-foreground hover:text-foreground"
                                                onclick={clearSimilarTag}
                                                aria-label="Clear tag"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    </div>
                                {:else}
                                    <input
                                        type="text"
                                        bind:value={similarTagInput}
                                        oninput={onSimilarTagInput}
                                        onkeydown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                if (similarTagInput.trim()) {
                                                    applySimilarTag(
                                                        similarTagInput,
                                                    );
                                                }
                                            }
                                        }}
                                        placeholder="Filter by one tag…"
                                        class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                    />
                                    {#if similarTagSuggestions.length > 0}
                                        <ul
                                            class="max-h-24 overflow-auto rounded-md border border-border bg-background text-xs"
                                        >
                                            {#each similarTagSuggestions as sug}
                                                <li>
                                                    <button
                                                        type="button"
                                                        class="w-full px-2 py-1 text-left hover:bg-secondary/60"
                                                        onclick={() =>
                                                            applySimilarTag(sug)}
                                                    >
                                                        {sug}
                                                    </button>
                                                </li>
                                            {/each}
                                        </ul>
                                    {/if}
                                {/if}
                            </div>
                            {#if similarFilterChips.length > 0}
                                <p class="text-[10px] text-muted-foreground">
                                    Active: {similarFilterChips.join(" · ")}
                                </p>
                            {/if}
                        </div>
                    {/if}

                    {#if similarItems.length > 0 || similarStatus}
                        <div>
                            <p
                                class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5"
                            >
                                Similar photos
                            </p>
                            {#if similarStatus && similarItems.length === 0}
                                <p class="text-xs text-muted-foreground">
                                    {similarStatus}
                                </p>
                            {:else}
                                <div class="grid grid-cols-3 gap-1">
                                    {#each similarItems as sim}
                                        <button
                                            type="button"
                                            class="aspect-square overflow-hidden rounded-md bg-secondary/60"
                                            title="{sim.project_title} · {sim.distance.toFixed(3)}"
                                            onclick={() => {
                                                if (
                                                    sim.project_slug ===
                                                    $page.params.project
                                                ) {
                                                    selectedHash = sim.hash;
                                                } else {
                                                    goto(
                                                        `/${sim.project_slug}/artefacts`,
                                                    );
                                                }
                                            }}
                                        >
                                            {#if sim.media_type.startsWith("image/")}
                                                <img
                                                    src={sim.url +
                                                        (accessToken
                                                            ? `?token=${encodeURIComponent(accessToken)}`
                                                            : "")}
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
                    {/if}

                    <div>
                        <p
                            class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5"
                        >
                            Linked entities
                        </p>
                        {#if links.length === 0}
                            <p class="text-xs text-muted-foreground">
                                Not linked to an entity
                            </p>
                        {:else}
                            <ul class="space-y-0.5">
                                {#each links as entity}
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
                                        </a>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>

                    <div
                        class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 font-mono hover:border-border hover:bg-background hover:text-foreground transition-colors"
                            title={selected.hash}
                            onclick={() => copyHash(selected.hash)}
                        >
                            {#if hashCopied}
                                <CheckIcon class="size-3 text-foreground" />
                            {:else}
                                <CopyIcon class="size-3" />
                            {/if}
                            {shortHash(selected.hash)}
                        </button>
                    </div>
                </div>
            {:else}
                <div
                    class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
                >
                    <ArchiveIcon class="size-7 text-muted-foreground/35" />
                    <p class="text-sm text-muted-foreground">
                        Select an item to preview
                    </p>
                </div>
            {/if}
        </aside>
    </div>

    <!-- Mobile detail sheet -->
    {#if selected}
        {@const links = linkedEntities(selected)}
        {@const pdf = isPdf(selected)}
        <div
            class="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border glass-dock p-4 max-h-[50vh] overflow-y-auto"
        >
            <div class="flex items-start justify-between gap-3 mb-3">
                <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground truncate">
                        {pdf
                            ? "Report"
                            : links[0]
                              ? entityLabel(links[0].entity_type)
                              : selected.media_type}
                    </p>
                    <p class="text-[11px] text-muted-foreground">
                        {formatBytes(selected.file_size)}
                    </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    {#if pdf}
                        <a
                            href={mediaUrl(selected)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground no-underline hover:text-foreground"
                        >
                            Open
                        </a>
                    {/if}
                    {#if selected.media_type.startsWith("image/") || pdf}
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
            {#if links.length > 0}
                <ul class="space-y-1">
                    {#each links as entity}
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
            {:else}
                <p class="text-xs text-muted-foreground">
                    Not linked to an entity
                </p>
            {/if}
        </div>
    {/if}

    <!-- Quiet media viewer -->
    {#if viewerOpen && selected && (selected.media_type.startsWith("image/") || isPdf(selected))}
        {@const pdf = isPdf(selected)}
        {@const links = linkedEntities(selected)}
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
                    {#if pdf}
                        Report · {formatBytes(selected.file_size)}
                    {:else if viewerIdx >= 0}
                        {viewerIdx + 1} / {imageItems.length}
                    {/if}
                </p>
                <div class="flex items-center gap-1">
                    {#if pdf}
                        <a
                            href={mediaUrl(selected)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs no-underline text-foreground hover:bg-secondary transition-colors"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <ExternalLinkIcon class="size-3.5" />
                            Open
                        </a>
                    {/if}
                    {#if links[0]}
                        <a
                            href={entityLink(
                                links[0].entity_type,
                                links[0].entity_id,
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
                class="relative flex-1 flex items-center justify-center min-h-0 {pdf
                    ? 'p-0'
                    : 'p-4'}"
                onclick={(e) => e.stopPropagation()}
            >
                {#if pdf}
                    <iframe
                        title="PDF viewer"
                        src={mediaUrl(selected, { pdfFit: true })}
                        class="h-full w-full border-0 bg-neutral-900"
                    ></iframe>
                {:else}
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
                {/if}
            </div>

            {#if links.length > 0 && !pdf}
                <div
                    class="border-t border-border px-4 py-3 flex flex-wrap gap-2"
                    onclick={(e) => e.stopPropagation()}
                >
                    {#each links as entity}
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
