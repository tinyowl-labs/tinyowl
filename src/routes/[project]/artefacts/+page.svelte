<script lang="ts">
    import { page } from "$app/stores";
    import ArchiveIcon from "@lucide/svelte/icons/archive";
    import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
    import PanelRightIcon from "@lucide/svelte/icons/panel-right";
    import { onMount } from "svelte";
    import ArtefactGridTile from "$lib/components/artefacts/ArtefactGridTile.svelte";
    import ArtefactDetailAside from "$lib/components/artefacts/ArtefactDetailAside.svelte";
    import ArtefactMobileSheet from "$lib/components/artefacts/ArtefactMobileSheet.svelte";
    import ArtefactLightbox from "$lib/components/artefacts/ArtefactLightbox.svelte";
    import {
        artefactMediaUrl,
        isGltf,
        isModel3D,
        isPdf,
        isTileset,
        tilesetNeedsIngest,
        type ArtefactMediaItem,
        type ArtefactSimilarHit,
    } from "$lib/components/artefacts/artefactMedia";
    import { goto } from "$app/navigation";
    import { bboxFromGeoJSON, formatBBox } from "$lib/search/params";

    let { data } = $props();

    const accessToken = $derived(data?.accessToken ?? "");
    const projectSlug = $derived($page.params.project ?? "");
    const canUpload = $derived(
        ["owner", "admin", "collaborator"].includes(
            String((data as any)?.role ?? "viewer"),
        ),
    );
    const isMember = $derived(Boolean((data as any)?.isMember));
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

    type TypeFilter =
        | "all"
        | "image"
        | "video"
        | "audio"
        | "pdf"
        | "model"
        | "coverage"
        | "other";

    let items = $state.raw<ArtefactMediaItem[]>([]);
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
    /** Session-only: panel button collapse stays until reload. */
    let sidebarHeldClosed = $state(false);
    /** Seeded once from `?media=` so dismissing the picker does not re-open. */
    let seededMedia = $state("");
    let viewerOpen = $state(false);
    let hashCopied = $state(false);
    let similarItems = $state.raw<ArtefactSimilarHit[]>([]);
    let similarStatus = $state("");
    let similarLoading = $state(false);
    let similarSamePeriod = $state(false);
    let similarSameRegion = $state(false);
    let careSaving = $state(false);
    let careError = $state("");

    async function patchCare(
        hash: string,
        patch: {
            care_allow_public_view?: boolean;
            care_allow_embed?: boolean;
            care_note?: string;
        },
    ) {
        if (!canUpload || !accessToken) return;
        careSaving = true;
        careError = "";
        try {
            const slug = $page.params.project;
            const res = await fetch(
                `/api/v1/projects/${slug}/media/${hash}/care`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify(patch),
                },
            );
            if (!res.ok) {
                careError = await res.text();
                return;
            }
            const data = await res.json();
            items = items.map((it) =>
                it.hash === hash
                    ? {
                          ...it,
                          care_allow_public_view: data.care_allow_public_view,
                          care_allow_embed: data.care_allow_embed,
                          care_note: data.care_note ?? null,
                      }
                    : it,
            );
        } catch (e) {
            careError = e instanceof Error ? e.message : "CARE update failed";
        } finally {
            careSaving = false;
        }
    }
    let similarFetched = $state(false);

    let loadedImages = $state<Set<string>>(new Set());
    let failedImages = $state<Set<string>>(new Set());
    let missingCount = $state(0);
    let orphanCount = $state(0);
    let integrityError = $state(false);
    let storageChecked = $state(false);
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
        // Viewers / non-members won't have a local checkout — don't scare them
        // with blob-cache diagnostics meant for collaborators.
        if (!isMember && !canUpload) {
            missingCount = 0;
            orphanCount = 0;
            integrityError = false;
            storageChecked = false;
            integrityChecked = true;
            return;
        }
        try {
            const slug = $page.params.project;
            const res = await fetch(
                `/api/v1/projects/${slug}/media/integrity`,
                accessToken
                    ? { headers: { Authorization: `Bearer ${accessToken}` } }
                    : {},
            );
            if (!res.ok) {
                integrityError = true;
                missingCount = 0;
                orphanCount = 0;
                integrityChecked = true;
                return;
            }
            const body = await res.json();
            missingCount = Array.isArray(body.missing_blobs)
                ? body.missing_blobs.length
                : 0;
            orphanCount = Array.isArray(body.orphan_blobs)
                ? body.orphan_blobs.length
                : 0;
            storageChecked = Boolean(body.storage_checked);
            integrityError = false;
            integrityChecked = true;
        } catch {
            integrityError = true;
            missingCount = 0;
            orphanCount = 0;
            integrityChecked = true;
        }
    }

    function mediaUrl(
        item: ArtefactMediaItem,
        opts?: { pdfFit?: boolean; variant?: "preview" | "full" },
    ): string {
        return artefactMediaUrl(item, accessToken, opts);
    }

    /** Grid / panel thumb: baked JPEG only — never the original blob. */
    function thumbUrl(item: ArtefactMediaItem): string {
        return mediaUrl(item, { variant: "preview" });
    }

    function openIn3D(hash: string) {
        const slug = $page.params.project;
        try {
            sessionStorage.setItem("tinyowl:layers:focusTileset", hash);
        } catch {
            /* ignore */
        }
        goto(`/${slug}/layers?view=3d&tileset=${encodeURIComponent(hash)}`);
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
    const asideOpen = $derived(Boolean(selected) && !sidebarHeldClosed);

    /** Poll tileset ingest while the selected artefact is not ready. */
    $effect(() => {
        const item = selected;
        const slug = projectSlug;
        const token = accessToken;
        if (!item || !slug || !tilesetNeedsIngest(item)) return;
        const hash = item.hash;
        let cancelled = false;

        const tick = async () => {
            try {
                const headers: Record<string, string> = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(
                    `/api/v1/projects/${slug}/tilesets/${hash}`,
                    { headers },
                );
                if (!res.ok || cancelled) return;
                const body = (await res.json()) as {
                    ingest_status?: string;
                    ingest_error?: string;
                    ingest_started_at?: string;
                };
                if (cancelled) return;
                const nextStatus = body.ingest_status;
                const nextError = body.ingest_error;
                const nextStarted = body.ingest_started_at;
                let changed = false;
                const next = items.map((it) => {
                    if (it.hash !== hash) return it;
                    const ingest_status = nextStatus ?? it.ingest_status;
                    const ingest_error = nextError ?? it.ingest_error;
                    const ingest_started_at =
                        nextStarted ?? it.ingest_started_at;
                    if (
                        ingest_status === it.ingest_status &&
                        ingest_error === it.ingest_error &&
                        ingest_started_at === it.ingest_started_at
                    ) {
                        return it;
                    }
                    changed = true;
                    return {
                        ...it,
                        ingest_status,
                        ingest_error,
                        ingest_started_at,
                    };
                });
                if (changed) items = next;
            } catch {
                /* ignore transient poll errors */
            }
        };

        void tick();
        const id = setInterval(() => void tick(), 2500);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    });

    function toggleAside() {
        if (asideOpen) sidebarHeldClosed = true;
        else sidebarHeldClosed = false;
    }

    const mediaParam = $derived(
        ($page.url.searchParams.get("media") ?? "").trim(),
    );

    $effect(() => {
        const hash = mediaParam;
        if (!hash || hash === seededMedia) return;
        if (!items.some((it) => it.hash === hash)) return;
        selectedHash = hash;
        seededMedia = hash;
    });

    const imageItems = $derived(
        filtered.filter((it) => it.media_type.startsWith("image/")),
    );

    const viewerIdx = $derived(
        selected && selected.media_type.startsWith("image/")
            ? imageItems.findIndex((it) => it.hash === selected.hash)
            : -1,
    );

    function selectItem(item: ArtefactMediaItem, opts?: { toggle?: boolean }) {
        if ((opts?.toggle ?? true) && selectedHash === item.hash) {
            selectedHash = null;
            viewerOpen = false;
            return;
        }
        selectedHash = item.hash;
        hashCopied = false;
        similarItems = [];
        similarStatus = "";
        similarFetched = false;
    }

    function removeSelected() {
        const hash = selectedHash;
        if (!hash) return;
        items = items.filter((it) => it.hash !== hash);
        totalItems = Math.max(0, totalItems - 1);
        selectedHash = null;
        viewerOpen = false;
        similarItems = [];
        similarStatus = "";
        similarFetched = false;
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

    function onSelectSimilar(hit: ArtefactSimilarHit) {
        if (hit.project_slug === $page.params.project) {
            selectedHash = hit.hash;
        } else {
            goto(`/${hit.project_slug}/artefacts`);
        }
    }

    function openViewer() {
        if (!selected) return;
        if (
            !selected.media_type.startsWith("image/") &&
            !isPdf(selected) &&
            !isModel3D(selected)
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
        if (e.key === "Escape") {
            selectedHash = null;
            viewerOpen = false;
        }
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
                filter !== "all" && filter !== "coverage"
                    ? `&type=${encodeURIComponent(filter)}`
                    : "";
            const profileParam =
                filter === "coverage" ? `&profile=coverage` : "";
            const res = await fetch(
                `/api/v1/projects/${slug}/media?offset=${at}&limit=${LIMIT}${typeParam}${profileParam}`,
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
                    if (filter === "all" || filter === "coverage") {
                        totalItems = parseInt(total, 10);
                    }
                }
            }
            const body = await res.json();
            const batch: ArtefactMediaItem[] = body.items ?? body;
            if (body.counts) {
                typeCounts = body.counts;
                const image = body.counts.image ?? 0;
                const video = body.counts.video ?? 0;
                const audio = body.counts.audio ?? 0;
                const application = body.counts.application ?? 0;
                const model = body.counts.model ?? 0;
                totalItems = image + video + audio + application + model;
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

    const filterTabs: { id: TypeFilter; label: string }[] = [
        { id: "all", label: "All" },
        { id: "image", label: "Photos" },
        { id: "pdf", label: "Reports" },
        { id: "model", label: "3D" },
        { id: "coverage", label: "Coverage" },
        { id: "video", label: "Videos" },
        { id: "audio", label: "Audio" },
        { id: "other", label: "Other" },
    ];

    function filterCount(id: TypeFilter): number | null {
        if (id === "all") return totalItems || items.length || null;
        if (id === "coverage") {
            // Server list with profile=coverage sets Content-Range; no global count yet.
            return typeFilter === "coverage"
                ? totalItems || items.length || null
                : null;
        }
        if (id === "pdf") {
            return typeCounts.pdf != null ? typeCounts.pdf : null;
        }
        if (id === "model") {
            return typeCounts.model != null ? typeCounts.model : null;
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
    <title>Artefacts — {$page.data?.project?.title ?? "Project"} — echidna</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full min-h-0 flex-col">
    {#if integrityChecked && (isMember || canUpload) && (integrityError || missingCount > 0 || orphanCount > 0)}
        <div
            class="mb-0 flex items-start gap-2 border-b border-border bg-secondary/40 px-5 py-2 text-xs text-muted-foreground"
        >
            <AlertTriangleIcon class="size-4 shrink-0 text-muted-foreground mt-0.5" />
            <p>
                {#if integrityError}
                    Could not check media integrity right now. Refresh or try again after signing in as a collaborator.
                {:else}
                    {#if missingCount > 0}
                        {#if storageChecked}
                            <span class="text-foreground"
                                >{missingCount} indexed file{missingCount === 1
                                    ? ""
                                    : "s"}</span
                            >
                            could not be found on this server or in cloud storage. If
                            previews fail, re-push media from a machine that has the
                            blobs.
                        {:else}
                            <span class="text-foreground"
                                >{missingCount} indexed file{missingCount === 1
                                    ? ""
                                    : "s"}</span
                            >
                            are not in this server’s local cache. Cloud storage is not
                            configured here — files may still load once storage is
                            connected, or after a collaborator re-pushes media.
                        {/if}
                    {/if}
                    {#if orphanCount > 0}
                        {#if missingCount > 0}<span class="mx-1">·</span>{/if}
                        <span class="text-foreground"
                            >{orphanCount} orphan blob{orphanCount === 1 ? "" : "s"}</span
                        >
                        on disk are not in the media index (safe to ignore, or clean up later).
                    {/if}
                {/if}
            </p>
        </div>
    {/if}

    <div class="flex min-h-0 flex-1 bg-background">
        <div class="min-h-0 flex-1 overflow-hidden p-5">
            <div class="flex h-full min-h-0 flex-col">
                <div class="flex items-center gap-1">
                    <div
                        class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1.5"
                        role="tablist"
                        aria-label="Artefact type"
                    >
                        {#each filterTabs as tab (tab.id)}
                            {@const n = filterCount(tab.id)}
                            <button
                                type="button"
                                role="tab"
                                aria-selected={typeFilter === tab.id}
                                onclick={() => setTypeFilter(tab.id)}
                                class="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 {typeFilter ===
                                tab.id
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground'}"
                            >
                                {tab.label}
                                {#if n != null}
                                    <span class="ml-1.5 text-xs text-muted-foreground"
                                        >({n})</span
                                    >
                                {/if}
                            </button>
                        {/each}
                    </div>
                    <button
                        type="button"
                        onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleAside();
                        }}
                        class="inline-flex shrink-0 rounded-md p-1.5 transition-colors {asideOpen
                            ? 'bg-secondary text-foreground'
                            : 'text-muted-foreground hover:text-foreground'}"
                        title={asideOpen ? "Hide detail pane" : "Show detail pane"}
                        aria-label={asideOpen
                            ? "Hide detail pane"
                            : "Show detail pane"}
                        aria-pressed={asideOpen}
                    >
                        <PanelRightIcon class="size-4" />
                    </button>
                </div>

                <div class="mt-5 min-h-0 flex-1 overflow-y-auto">
                    {#if loading && items.length === 0}
                        <div
                            class="flex h-64 items-center justify-center text-sm text-muted-foreground"
                        >
                            Loading…
                        </div>
                    {:else if items.length === 0}
                        <div class="flex h-64 items-center justify-center">
                            <div class="max-w-sm text-center">
                                <ArchiveIcon
                                    class="mx-auto mb-3 size-8 text-muted-foreground/40"
                                />
                                <h2
                                    class="mb-1 text-base font-semibold text-foreground"
                                >
                                    {typeFilter === "all"
                                        ? "No artefacts yet"
                                        : typeFilter === "pdf"
                                          ? "No reports yet"
                                          : typeFilter === "image"
                                            ? "No photos yet"
                                            : typeFilter === "coverage"
                                              ? "No coverage layers yet"
                                              : `No ${typeFilter} yet`}
                                </h2>
                                <p class="text-sm text-muted-foreground">
                                    {typeFilter === "all"
                                        ? "Land photos or PDFs from Import → Media, or push a GPKG that already has them."
                                        : typeFilter === "model"
                                          ? "Import a .3tz or .glb (collaborator+) — preview here, or open georeferenced models in Layers → 3D."
                                          : typeFilter === "coverage"
                                            ? "Import a GeoTIFF or .3tz from Import → Media. No table required."
                                            : "Try another filter, or import files that match this type."}
                                </p>
                                {#if canUpload}
                                    <a
                                        href="/{projectSlug}/import?kind=media"
                                        class="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground no-underline"
                                    >
                                        Import media
                                    </a>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div
                            class="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6"
                        >
                            {#each filtered as item (item.hash)}
                                <ArtefactGridTile
                                    {item}
                                    active={selectedHash === item.hash}
                                    imgLoaded={loadedImages.has(item.hash)}
                                    imgFailed={failedImages.has(item.hash)}
                                    thumbSrc={thumbUrl(item)}
                                    onselect={() => selectItem(item)}
                                    onopen={() => {
                                        selectItem(item, { toggle: false });
                                        if (
                                            item.media_type.startsWith("image/") ||
                                            isTileset(item) ||
                                            isGltf(item) ||
                                            isPdf(item)
                                        ) {
                                            viewerOpen = true;
                                        }
                                    }}
                                    onimgload={() => onImageLoad(item.hash)}
                                    onimgerror={() => onImageError(item.hash)}
                                />
                            {/each}
                        </div>

                        {#if hasMore}
                            <div
                                bind:this={sentinel}
                                class="flex items-center justify-center py-8"
                            >
                                {#if loading}
                                    <p
                                        class="animate-pulse text-sm text-muted-foreground"
                                    >
                                        Loading…
                                    </p>
                                {/if}
                            </div>
                        {:else if items.length > 0}
                            <p
                                class="py-6 text-center text-xs text-muted-foreground"
                            >
                                {filtered.length} shown
                            </p>
                        {/if}
                    {/if}

                    {#if error}
                        <p class="py-4 text-center text-sm text-destructive">
                            {error}
                        </p>
                    {/if}
                </div>
            </div>
        </div>

        {#if asideOpen && selected}
            <aside
                class="hidden w-[22rem] shrink-0 flex-col overflow-hidden border-l border-border surface lg:flex"
            >
                {#key selected.hash}
                    <ArtefactDetailAside
                        item={selected}
                        accessToken={accessToken}
                        {projectSlug}
                        canUpload={canUpload}
                        viewerOpen={viewerOpen}
                        careSaving={careSaving}
                        careError={careError}
                        hashCopied={hashCopied}
                        similarItems={similarItems}
                        similarStatus={similarStatus}
                        similarLoading={similarLoading}
                        similarSamePeriod={similarSamePeriod}
                        similarSameRegion={similarSameRegion}
                        projectPeriod={projectPeriod}
                        projectRegion={projectRegion}
                        thumbSrc={thumbUrl(selected)}
                        {openViewer}
                        {openIn3D}
                        {patchCare}
                        {findSimilar}
                        {setSamePeriod}
                        {setSameRegion}
                        {copyHash}
                        {onSelectSimilar}
                        onRemoved={removeSelected}
                    />
                {/key}
            </aside>
        {/if}
    </div>

    {#if selected}
        <ArtefactMobileSheet
            item={selected}
            accessToken={accessToken}
            {projectSlug}
            canUpload={canUpload}
            onclose={() => (selectedHash = null)}
            onRemoved={removeSelected}
        />
    {/if}

    {#if viewerOpen && selected}
        <ArtefactLightbox
            item={selected}
            accessToken={accessToken}
            {projectSlug}
            viewerIdx={viewerIdx}
            imageCount={imageItems.length}
            {closeViewer}
            {prevImage}
            {nextImage}
            {openIn3D}
        />
    {/if}
</div>
