<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import Header from "$lib/components/ui/header.svelte";
    import SearchComposer from "$lib/components/SearchComposer.svelte";
    import SpatialMap from "$lib/components/SpatialMap.svelte";
    import TemporalRangeFilter from "$lib/components/TemporalRangeFilter.svelte";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import HashIcon from "@lucide/svelte/icons/hash";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import CalendarIcon from "@lucide/svelte/icons/calendar";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import SearchIcon from "@lucide/svelte/icons/search";
    import ImageOffIcon from "@lucide/svelte/icons/image-off";
    import { untrack } from "svelte";
    import {
        DEFAULT_SEARCH_RADIUS,
        formatDateSpan,
        formatRadius,
        formatYear,
        hasActiveSearch,
        searchHref,
        type SearchBBox,
        type SearchParams,
    } from "$lib/search/params";
    import {
        formatMatchDetail,
        headlineHtml,
        highlightHtml,
        textMatchesQuery,
    } from "$lib/search/highlight";
    import { entityLayersHref } from "$lib/project/entityLink";
    import type { SearchProject, SimilarMediaItem } from "./+page.server";
    import {
        clearImageQuery,
        loadImageQuery,
        type ImageQueryHit,
        type ImageQueryProject,
        type ImageQuerySession,
    } from "$lib/search/imageQuery";

    type EntityResult = {
        entity_type: string;
        entity_id: string;
        column_name: string;
        match_value: string;
        project_slug?: string;
    };

    type PageData = {
        user: any;
        accessToken: string | null;
        query: string;
        lat: number | null;
        lng: number | null;
        radius: number | null;
        bbox: SearchBBox | null;
        dateFrom: number | null;
        dateTo: number | null;
        tags: string[];
        vocabularies: string[];
        semantic: boolean;
        mediaHash: string | null;
        imageQuery: boolean;
        similarItems: SimilarMediaItem[];
        similarStatus: string;
        projects: SearchProject[];
    };

    let { data }: { data: PageData } = $props();
    const hasSession = $derived(Boolean($page.data?.user));

    let query = $state(untrack(() => data.query) || "");
    let centerLat = $state(untrack(() => data.lat));
    let centerLng = $state(untrack(() => data.lng));
    let radius = $state(untrack(() => data.radius ?? DEFAULT_SEARCH_RADIUS));
    let searchBBox = $state<SearchBBox | null>(untrack(() => data.bbox));
    let dateFrom = $state(untrack(() => data.dateFrom?.toString() ?? ""));
    let dateTo = $state(untrack(() => data.dateTo?.toString() ?? ""));
    let tags = $state<string[]>(untrack(() => data.tags ?? []));
    let vocabularies = $state<string[]>(untrack(() => data.vocabularies ?? []));
    let mediaHash = $state<string | null>(untrack(() => data.mediaHash));
    let imageQuery = $state(untrack(() => data.imageQuery));
    let imageSession = $state<ImageQuerySession | null>(
        untrack(() => (data.imageQuery ? loadImageQuery() : null)),
    );

    $effect(() => {
        query = data.query || "";
        centerLat = data.lat;
        centerLng = data.lng;
        radius = data.radius ?? DEFAULT_SEARCH_RADIUS;
        searchBBox = data.bbox;
        dateFrom = data.dateFrom?.toString() ?? "";
        dateTo = data.dateTo?.toString() ?? "";
        tags = data.tags ?? [];
        vocabularies = data.vocabularies ?? [];
        mediaHash = data.mediaHash;
        imageQuery = data.imageQuery;
        imageSession = data.imageQuery ? loadImageQuery() : null;
    });

    const activeQuery = $derived(
        hasActiveSearch({
            q: data.query,
            lat: data.lat,
            lng: data.lng,
            radius: data.radius,
            bbox: data.bbox,
            dateFrom: data.dateFrom,
            dateTo: data.dateTo,
            tags: data.tags ?? [],
            vocabularies: data.vocabularies ?? [],
            types: [],
            semantic: data.semantic,
            mediaHash: data.mediaHash,
            imageQuery: data.imageQuery,
        } satisfies SearchParams),
    );

    const imageHits = $derived.by((): Array<SimilarMediaItem | ImageQueryHit> => {
        if (imageSession?.items?.length) return imageSession.items;
        return data.similarItems ?? [];
    });
    const imageStatus = $derived(
        imageSession?.status || data.similarStatus || "",
    );
    /** Image grid: reverse-image modes, or text→CLIP media hits. */
    const showImageResults = $derived(
        Boolean(data.mediaHash) ||
            Boolean(data.imageQuery) ||
            imageHits.length > 0,
    );
    const isReverseImage = $derived(
        Boolean(data.mediaHash) || Boolean(data.imageQuery),
    );

    function projectFromImageHit(p: ImageQueryProject): SearchProject {
        return {
            result_kind: "project",
            slug: p.slug,
            title: p.title,
            description: p.description ?? null,
            entity_count: p.entity_count ?? 0,
            table_count: p.table_count ?? 0,
            bbox: p.bbox ?? null,
            match_detail: p.match_detail || "visual",
            tags_manual: p.tags_manual,
            tags_auto: p.tags_auto,
            date_start: p.date_start ?? null,
            date_end: p.date_end ?? null,
            date_start_label: p.date_start_label ?? null,
            date_end_label: p.date_end_label ?? null,
        };
    }

    const displayProjects = $derived.by((): SearchProject[] => {
        const primary = data.projects ?? [];
        const related = imageSession?.projects ?? [];
        if (!related.length) return primary;
        const seen = new Set(primary.map((p) => p.slug.toLowerCase()));
        const out = [...primary];
        for (const r of related) {
            const key = r.slug.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(projectFromImageHit(r));
        }
        return out;
    });

    const resultMarkers = $derived(
        displayProjects
            .filter((p) => p.bbox)
            .map((p) => ({
                slug: p.slug,
                title: p.title,
                bbox: p.bbox,
            })),
    );

    let loadedImages = $state<Set<string>>(new Set());
    let failedImages = $state<Set<string>>(new Set());

    function onImageLoad(hash: string) {
        loadedImages = new Set([...loadedImages, hash]);
    }
    function onImageError(hash: string) {
        failedImages = new Set([...failedImages, hash]);
    }

    $effect(() => {
        // Reset load tracking when the hit set changes.
        const key = imageHits.map((h) => h.hash).join(",");
        void key;
        loadedImages = new Set();
        failedImages = new Set();
    });

    let expanded = $state<Record<string, boolean>>({});
    let entityCache = $state<
        Record<string, EntityResult[] | "loading" | "error">
    >({});
    // Non-reactive guard — reading/writing $state entityCache inside $effect
    // was retriggering prefetch forever.
    const entityFetchKeys = new Set<string>();
    let lastPrefetchQ = "";

    function entitiesFor(slug: string): EntityResult[] | null {
        const v = entityCache[slug];
        return Array.isArray(v) ? v : null;
    }

    function entityCacheKey(slug: string, q: string): string {
        return `${q}\0${slug}`;
    }

    function navigateWith(
        overrides: Partial<{
            q: string;
            lat: number | null;
            lng: number | null;
            radius: number | null;
            bbox: SearchBBox | null;
            dateFrom: string | number | null;
            dateTo: string | number | null;
            tags: string[];
            vocabularies: string[];
            mediaHash: string | null;
            imageQuery: boolean;
        }> = {},
    ) {
        const nextBBox =
            overrides.bbox !== undefined ? overrides.bbox : searchBBox;
        const nextLat =
            overrides.lat !== undefined ? overrides.lat : centerLat;
        const nextLng =
            overrides.lng !== undefined ? overrides.lng : centerLng;
        const nextMediaHash =
            overrides.mediaHash !== undefined
                ? overrides.mediaHash
                : mediaHash;
        const nextImageQuery =
            overrides.imageQuery !== undefined
                ? overrides.imageQuery
                : imageQuery;
        // BBox and point+radius are mutually exclusive in the URL.
        goto(
            searchHref({
                q: overrides.q ?? query,
                bbox: nextBBox,
                lat: nextBBox ? null : nextLat,
                lng: nextBBox ? null : nextLng,
                radius: nextBBox
                    ? null
                    : overrides.radius !== undefined
                      ? overrides.radius
                      : radius,
                dateFrom:
                    overrides.dateFrom !== undefined
                        ? overrides.dateFrom
                        : dateFrom,
                dateTo:
                    overrides.dateTo !== undefined ? overrides.dateTo : dateTo,
                tags: overrides.tags !== undefined ? overrides.tags : tags,
                vocabularies:
                    overrides.vocabularies !== undefined
                        ? overrides.vocabularies
                        : vocabularies,
                mediaHash: nextMediaHash,
                // Catalogue seed and temp upload are mutually exclusive.
                imageQuery: nextMediaHash ? false : nextImageQuery,
                // Preserve quiet opt-out from the URL; never write semantic=1.
                semantic: data.semantic ? undefined : false,
            }),
        );
    }

    /** Same URL shape as artefacts shelf (`/media/{hash}?token=`). */
    function mediaUrl(item: SimilarMediaItem | ImageQueryHit): string {
        const base = item.url?.startsWith("/")
            ? item.url
            : `/media/${item.hash}`;
        return data.accessToken
            ? `${base}?token=${encodeURIComponent(data.accessToken)}`
            : base;
    }

    const queryPreview = $derived.by((): string | null => {
        if (imageSession?.previewDataUrl) return imageSession.previewDataUrl;
        if (!data.mediaHash) return null;
        const base = `/media/${data.mediaHash}`;
        return data.accessToken
            ? `${base}?token=${encodeURIComponent(data.accessToken)}`
            : base;
    });

    /** OpenCLIP cosine distance → rough similarity % for display. */
    function similarityPct(distance: number): number {
        const sim = Math.max(0, Math.min(1, 1 - distance));
        return Math.round(sim * 100);
    }

    function clearImageSearch() {
        clearImageQuery();
        navigateWith({ mediaHash: null, imageQuery: false });
    }

    function onTemporalCommit(from: number | null, to: number | null) {
        dateFrom = from != null ? String(from) : "";
        dateTo = to != null ? String(to) : "";
        navigateWith({ dateFrom, dateTo });
    }

    function updateSpatial() {
        navigateWith({
            bbox: searchBBox,
            lat: searchBBox ? null : centerLat,
            lng: searchBBox ? null : centerLng,
            radius: searchBBox ? null : radius,
        });
    }

    let spatialTimeout: ReturnType<typeof setTimeout>;
    function onLatChange() {
        clearTimeout(spatialTimeout);
        spatialTimeout = setTimeout(updateSpatial, 400);
    }

    function formatDistance(m: number): string {
        if (m < 1000) return `${Math.round(m)}m`;
        return `${(m / 1000).toFixed(1)}km`;
    }

    function projectTags(proj: SearchProject): string[] {
        const manual = proj.tags_manual ?? [];
        const auto = proj.tags_auto ?? [];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const t of [...manual, ...auto]) {
            const key = t.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(t);
            if (out.length >= 8) break;
        }
        return out;
    }

    /** Matching tags first so relevance is visible. */
    function orderedTags(proj: SearchProject): string[] {
        const tags = projectTags(proj);
        if (!data.query) return tags;
        return [
            ...tags.filter((t) => textMatchesQuery(t, data.query)),
            ...tags.filter((t) => !textMatchesQuery(t, data.query)),
        ];
    }

    function dateLabel(proj: SearchProject): string | null {
        if (proj.date_start_label || proj.date_end_label) {
            const a = proj.date_start_label ?? "";
            const b = proj.date_end_label ?? "";
            if (a && b && a !== b) return `${a} – ${b}`;
            return a || b || null;
        }
        return formatDateSpan(proj.date_start, proj.date_end);
    }

    async function loadEntities(
        slug: string,
        q: string = data.query,
        opts: { force?: boolean } = {},
    ) {
        if (!q) return;
        const key = entityCacheKey(slug, q);
        if (!opts.force && entityFetchKeys.has(key)) {
            // Prefetch may have marked the key without leaving usable cache
            // (e.g. query flipped back after a clear). Retry if empty/error.
            const existing = untrack(() => entityCache[slug]);
            if (existing === "loading" || Array.isArray(existing)) return;
        }
        entityFetchKeys.add(key);

        entityCache = { ...untrack(() => entityCache), [slug]: "loading" };
        try {
            const url = `/api/projects/${slug}/search-entities?q=${encodeURIComponent(q)}&limit=8`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(String(res.status));
            const rows: EntityResult[] = await res.json();
            entityCache = { ...untrack(() => entityCache), [slug]: rows };
        } catch {
            entityFetchKeys.delete(key);
            entityCache = { ...untrack(() => entityCache), [slug]: "error" };
        }
    }

    async function toggleEntities(slug: string) {
        const next = !expanded[slug];
        expanded = { ...expanded, [slug]: next };
        if (!next) return;
        const existing = untrack(() => entityCache[slug]);
        if (!Array.isArray(existing)) {
            await loadEntities(slug, data.query, { force: true });
        }
    }

    // Prefetch once per query+slug (must not track entityCache).
    $effect(() => {
        const q = data.query;
        const projects = displayProjects;
        if (!q || !projects?.length) return;
        untrack(() => {
            if (q !== lastPrefetchQ) {
                lastPrefetchQ = q;
                entityCache = {};
                entityFetchKeys.clear();
            }
            for (const p of projects.slice(0, 12)) {
                void loadEntities(p.slug, q);
            }
        });
    });

    function entityHref(slug: string, entity: EntityResult): string {
        return entityLayersHref(slug, {
            layer: entity.entity_type,
            highlight: entity.entity_id,
        });
    }
</script>

<svelte:head>
    <title>{data.query ? `${data.query} — Search` : "Search"} — TinyOwl</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-background">
    <Header {hasSession} />

    <main class="flex-1 w-full mx-auto px-4 py-4 max-w-6xl">
        <div class="mb-4">
            <SearchComposer
                bind:value={query}
                {tags}
                {vocabularies}
                lat={centerLat}
                lng={centerLng}
                {radius}
                bbox={searchBBox}
                {dateFrom}
                {dateTo}
                semantic={data.semantic}
                mediaHash={mediaHash}
                imageQuery={imageQuery}
                accessToken={data.accessToken}
                autofocus={!activeQuery}
            />
        </div>

        <div
            class="search-vt-panel grid gap-8 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start"
        >
            <aside class="lg:sticky lg:top-4 space-y-7 text-sm">
                <section>
                    <h2
                        class="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-3"
                    >
                        <CalendarIcon class="size-3.5" />
                        Temporal
                    </h2>
                    <TemporalRangeFilter
                        projects={displayProjects}
                        bind:dateFrom
                        bind:dateTo
                        onCommit={onTemporalCommit}
                    />
                </section>

                <section>
                    <h2
                        class="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-3"
                    >
                        <CrosshairIcon class="size-3.5" />
                        Spatial
                    </h2>
                    <SpatialMap
                        bind:centerLat
                        bind:centerLng
                        bind:radius
                        bind:searchBBox
                        results={resultMarkers}
                        onChange={onLatChange}
                    />
                </section>
            </aside>

            <div class="min-w-0">
                {#if !activeQuery}
                    <div class="py-8 text-muted-foreground">
                        <SearchIcon class="size-8 mb-3 opacity-30" />
                        <p class="text-lg text-foreground">Search TinyOwl</p>
                        <p class="text-sm mt-2 max-w-md">
                            Find projects by title, vocabulary, period, or place —
                            or attach an image to find visually similar photos.
                            Use the filters on the left, or browse the
                            <a
                                href="/"
                                class="text-primary underline-offset-2 hover:underline"
                                >home map</a
                            >.
                        </p>
                    </div>
                {:else}
                    {#if showImageResults}
                        <section class="mb-8">
                            {#if isReverseImage}
                                <div
                                    class="mb-4 flex flex-wrap items-start gap-4 border-b border-border pb-4"
                                >
                                    {#if queryPreview}
                                        <div
                                            class="relative size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/50"
                                        >
                                            <img
                                                src={queryPreview}
                                                alt="Query image"
                                                class="h-full w-full object-cover"
                                            />
                                        </div>
                                    {/if}
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm text-foreground">
                                            {#if data.imageQuery}
                                                Visually similar photos
                                            {:else}
                                                Similar to catalogue photo
                                            {/if}
                                            {#if imageHits.length > 0}
                                                <span class="text-muted-foreground">
                                                    · {imageHits.length} match{imageHits.length !==
                                                    1
                                                        ? "es"
                                                        : ""}
                                                </span>
                                            {/if}
                                        </p>
                                        <p
                                            class="mt-1 text-xs text-muted-foreground max-w-lg"
                                        >
                                            {#if data.imageQuery}
                                                Your upload was embedded with CLIP
                                                and compared to the media corpus —
                                                it was not saved to any project.
                                                Related projects come from the same
                                                embedding space.
                                            {:else}
                                                Neighbours from OpenCLIP embeddings
                                                for this catalogue image, plus
                                                related projects.
                                            {/if}
                                        </p>
                                        <button
                                            type="button"
                                            class="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                            onclick={clearImageSearch}
                                        >
                                            Clear image search
                                        </button>
                                    </div>
                                </div>
                            {:else if data.query}
                                <p class="text-sm text-muted-foreground mb-3">
                                    Photos matching “{data.query}”
                                    {#if imageHits.length > 0}
                                        · {imageHits.length}
                                    {/if}
                                </p>
                            {/if}

                            {#if data.imageQuery && !imageSession && imageHits.length === 0}
                                <p class="text-sm text-muted-foreground py-4">
                                    Query image is missing from this browser
                                    session. Attach a photo again in the search
                                    bar to re-run the comparison.
                                </p>
                            {:else if imageStatus && imageHits.length === 0 && isReverseImage}
                                <p class="text-sm text-muted-foreground py-4">
                                    {imageStatus}
                                </p>
                            {:else if imageHits.length > 0}
                                <div
                                    class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5"
                                >
                                    {#each imageHits as sim (sim.hash + sim.project_slug)}
                                        {@const isImage =
                                            sim.media_type.startsWith("image/")}
                                        {@const imgLoaded = loadedImages.has(
                                            sim.hash,
                                        )}
                                        {@const imgFailed = failedImages.has(
                                            sim.hash,
                                        )}
                                        <a
                                            href={`/${sim.project_slug}/artefacts`}
                                            class="group relative aspect-square overflow-hidden rounded-md bg-secondary/60 no-underline outline-none transition-[box-shadow] hover:shadow-[inset_0_0_0_1px_var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                            title="{sim.project_title} · {similarityPct(
                                                sim.distance,
                                            )}% similar"
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
                                                    src={mediaUrl(sim)}
                                                    alt=""
                                                    class="h-full w-full object-cover {imgLoaded
                                                        ? 'opacity-100'
                                                        : 'opacity-0'} transition-opacity duration-200"
                                                    loading="lazy"
                                                    onload={() =>
                                                        onImageLoad(sim.hash)}
                                                    onerror={() =>
                                                        onImageError(sim.hash)}
                                                />
                                            {:else}
                                                <div
                                                    class="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground"
                                                >
                                                    {sim.project_title}
                                                </div>
                                            {/if}
                                            <span
                                                class="pointer-events-none absolute bottom-1 left-1 z-20 max-w-[calc(100%-0.5rem)] truncate rounded bg-background/80 px-1 py-0.5 text-[10px] text-foreground/80 opacity-0 transition-opacity group-hover:opacity-100"
                                            >
                                                {sim.project_title}
                                            </span>
                                            <span
                                                class="absolute bottom-1.5 right-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground"
                                            >
                                                {similarityPct(sim.distance)}%
                                            </span>
                                        </a>
                                    {/each}
                                </div>
                            {/if}
                        </section>
                    {/if}

                    {#if displayProjects.length === 0 && !showImageResults}
                        <div class="py-8 text-muted-foreground">
                            <p class="text-lg text-foreground">No projects found</p>
                            <p class="text-sm mt-2">
                                Try different terms, a wider area, or
                                <a
                                    href="/"
                                    class="text-primary underline-offset-2 hover:underline"
                                    >explore the map</a
                                >.
                            </p>
                        </div>
                    {:else if displayProjects.length > 0}
                    <p class="text-sm text-muted-foreground mb-3">
                        {displayProjects.length} project{displayProjects.length !== 1
                            ? "s"
                            : ""}
                        {#if data.query}
                            matching “{data.query}”
                        {:else if isReverseImage}
                            related to this image
                        {/if}
                        {#if data.bbox}
                            in map area
                        {:else if data.lat !== null}
                            within {formatRadius(
                                data.radius ?? DEFAULT_SEARCH_RADIUS,
                            )}
                        {/if}
                        {#if data.dateFrom != null || data.dateTo != null}
                            · {formatYear(data.dateFrom ?? -12000)}–{formatYear(
                                data.dateTo ?? 2100,
                            )}
                        {/if}
                    </p>

                    <ul class="divide-y divide-border border-y border-border">
                        {#each displayProjects as proj}
                            {@const matchLabel = formatMatchDetail(
                                proj.match_detail,
                            )}
                            {@const tags = orderedTags(proj)}
                            <li class="py-4">
                                <div
                                    class="flex items-start justify-between gap-3"
                                >
                                    <a
                                        href="/{proj.slug}"
                                        class="min-w-0 flex-1 no-underline group"
                                    >
                                        <h2
                                            class="text-base font-semibold text-foreground group-hover:text-primary transition-colors"
                                        >
                                            {@html highlightHtml(
                                                proj.title,
                                                data.query,
                                            )}
                                        </h2>
                                        {#if proj.description}
                                            <p
                                                class="text-sm text-muted-foreground mt-1 line-clamp-2"
                                            >
                                                {@html highlightHtml(
                                                    proj.description,
                                                    data.query,
                                                )}
                                            </p>
                                        {/if}
                                    </a>
                                    {#if matchLabel}
                                        <span
                                            class="shrink-0 max-w-[9rem] text-right text-[11px] leading-snug rounded-md bg-primary/10 text-primary px-2 py-1"
                                            title={proj.match_detail}
                                        >
                                            {matchLabel}
                                        </span>
                                    {/if}
                                </div>

                                <div
                                    class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
                                >
                                    <span class="inline-flex items-center gap-1">
                                        <LayersIcon class="size-3.5" />
                                        {proj.table_count}
                                    </span>
                                    <span class="inline-flex items-center gap-1">
                                        <HashIcon class="size-3.5" />
                                        {proj.entity_count.toLocaleString()}
                                    </span>
                                    {#if dateLabel(proj)}
                                        <span
                                            class="inline-flex items-center gap-1"
                                        >
                                            <CalendarIcon class="size-3.5" />
                                            {dateLabel(proj)}
                                        </span>
                                    {/if}
                                    {#if proj.distance_m != null}
                                        <span
                                            class="inline-flex items-center gap-1"
                                        >
                                            <MapPinIcon class="size-3.5" />
                                            {formatDistance(proj.distance_m)}
                                        </span>
                                    {/if}
                                </div>

                                {#if tags.length}
                                    <div class="mt-2 flex flex-wrap gap-1.5">
                                        {#each tags as tag}
                                            {@const hit = textMatchesQuery(
                                                tag,
                                                data.query,
                                            )}
                                            <span
                                                class="text-[11px] rounded-md px-1.5 py-0.5 {hit
                                                    ? 'bg-primary/15 text-primary font-medium'
                                                    : 'text-muted-foreground'}"
                                            >
                                                {#if hit}
                                                    #{@html highlightHtml(
                                                        tag,
                                                        data.query,
                                                    )}
                                                {:else}
                                                    #{tag}
                                                {/if}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}

                                {#if data.query}
                                    {@const ents = entitiesFor(proj.slug)}
                                    {@const hits = proj.match_hits ?? []}
                                    {@const snippet = proj.match_snippet ?? ""}
                                    {@const showReason =
                                        Boolean(snippet) ||
                                        hits.length > 0 ||
                                        (ents && ents.length > 0)}
                                    {#if showReason}
                                        <div class="mt-2">
                                            {#if !expanded[proj.slug]}
                                                <div
                                                    class="mb-1.5 space-y-1 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2"
                                                >
                                                    <p
                                                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                                    >
                                                        Why it matched
                                                    </p>
                                                    {#if snippet}
                                                        <p
                                                            class="text-xs text-foreground leading-snug"
                                                        >
                                                            <span
                                                                class="text-muted-foreground font-medium"
                                                            >
                                                                {formatMatchDetail(
                                                                    proj.match_detail,
                                                                ) || "Match"}:
                                                            </span>
                                                            {@html headlineHtml(
                                                                snippet,
                                                                data.query,
                                                            )}
                                                        </p>
                                                    {:else if hits.length > 0}
                                                        {#each hits.slice(0, 3) as hit}
                                                            <p
                                                                class="flex items-baseline gap-2 text-xs"
                                                            >
                                                                <span
                                                                    class="font-mono text-muted-foreground shrink-0"
                                                                >
                                                                    {hit.entity_type}.{hit.column_name}
                                                                </span>
                                                                <span
                                                                    class="text-foreground truncate"
                                                                >
                                                                    {@html highlightHtml(
                                                                        hit.local_value,
                                                                        data.query,
                                                                    )}
                                                                </span>
                                                            </p>
                                                        {/each}
                                                    {:else if ents}
                                                        {#each ents.slice(0, 3) as entity}
                                                            <a
                                                                href={entityHref(
                                                                    proj.slug,
                                                                    entity,
                                                                )}
                                                                class="flex items-baseline gap-2 text-xs no-underline hover:text-primary"
                                                            >
                                                                <span
                                                                    class="font-mono text-muted-foreground shrink-0"
                                                                >
                                                                    {entity.entity_type}.{entity.column_name}
                                                                </span>
                                                                <span
                                                                    class="text-foreground truncate"
                                                                >
                                                                    {@html highlightHtml(
                                                                        entity.match_value,
                                                                        data.query,
                                                                    )}
                                                                </span>
                                                            </a>
                                                        {/each}
                                                    {/if}
                                                </div>
                                            {/if}
                                            {#if ents && ents.length > 0}
                                                <button
                                                    type="button"
                                                    onclick={() =>
                                                        toggleEntities(
                                                            proj.slug,
                                                        )}
                                                    class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {expanded[proj.slug]
                                                        ? "Hide entities"
                                                        : ents.length > 3
                                                          ? `In project data (${ents.length})`
                                                          : "In project data"}
                                                    <ChevronDownIcon
                                                        class="size-3.5 transition-transform {expanded[
                                                            proj.slug
                                                        ]
                                                            ? 'rotate-180'
                                                            : ''}"
                                                    />
                                                </button>
                                                {#if expanded[proj.slug]}
                                                    <div
                                                        class="mt-2 space-y-1.5 pl-1"
                                                    >
                                                        {#each ents as entity}
                                                            <a
                                                                href={entityHref(
                                                                    proj.slug,
                                                                    entity,
                                                                )}
                                                                class="flex items-baseline gap-2 text-xs no-underline hover:text-primary rounded-md px-1.5 py-1 -mx-1.5 hover:bg-accent/60"
                                                            >
                                                                <span
                                                                    class="font-mono text-muted-foreground shrink-0"
                                                                >
                                                                    {entity.entity_type}
                                                                </span>
                                                                <span
                                                                    class="font-medium text-foreground truncate"
                                                                >
                                                                    {@html highlightHtml(
                                                                        entity.entity_id,
                                                                        data.query,
                                                                    )}
                                                                </span>
                                                                <span
                                                                    class="text-muted-foreground truncate min-w-0"
                                                                >
                                                                    — {@html highlightHtml(
                                                                        entity.match_value,
                                                                        data.query,
                                                                    )}
                                                                </span>
                                                            </a>
                                                        {/each}
                                                    </div>
                                                {/if}
                                            {:else if hits.length > 3}
                                                <p
                                                    class="text-[11px] text-muted-foreground"
                                                >
                                                    +{hits.length - 3} more vocabulary
                                                    terms
                                                </p>
                                            {/if}
                                        </div>
                                    {/if}
                                {/if}
                            </li>
                        {/each}
                    </ul>
                    {/if}
                {/if}
            </div>
        </div>
    </main>
</div>
