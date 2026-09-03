<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import SpatialDiscovery from "$lib/components/discovery/SpatialDiscovery.svelte";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import SearchIcon from "@lucide/svelte/icons/search";
    import ImageOffIcon from "@lucide/svelte/icons/image-off";
    import { untrack } from "svelte";
    import {
        DEFAULT_SEARCH_RADIUS,
        hasActiveSearch,
        searchHref,
        type SearchBBox,
        type SearchParams,
    } from "$lib/search/params";
    import {
        headlineHtml,
        highlightHtml,
    } from "$lib/search/highlight";
    import { entityLayersHref } from "$lib/project/entityLink";
    import type { SearchProject, SimilarMediaItem, SearchEntityHit } from "./+page.server";
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
        projectSlugs: string[];
        semantic: boolean;
        mediaHash: string | null;
        imageQuery: boolean;
        similarItems: SimilarMediaItem[];
        similarStatus: string;
        projects: SearchProject[];
        entityHits: Record<string, SearchEntityHit[]>;
        placeName: string | null;
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
    let projectSlugs = $state<string[]>(untrack(() => data.projectSlugs ?? []));
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
        projectSlugs = data.projectSlugs ?? [];
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
            projects: data.projectSlugs ?? [],
            types: [],
            semantic: data.semantic,
            mediaHash: data.mediaHash,
            imageQuery: data.imageQuery,
            placeName: data.placeName,
        } satisfies SearchParams),
    );

    const projectLabels = $derived.by(() => {
        const labels: Record<string, string> = {};
        for (const p of data.projects ?? []) {
            if (p.slug && p.title) labels[p.slug] = p.title;
        }
        return labels;
    });

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
            projects: string[];
            mediaHash: string | null;
            imageQuery: boolean;
            placeName: string | null;
        }> = {},
        nav: { replaceState?: boolean } = {},
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
                projects:
                    overrides.projects !== undefined
                        ? overrides.projects
                        : projectSlugs,
                mediaHash: nextMediaHash,
                // Catalogue seed and temp upload are mutually exclusive.
                imageQuery: nextMediaHash ? false : nextImageQuery,
                // Preserve quiet opt-out from the URL; never write semantic=1.
                placeName:
                    overrides.placeName !== undefined
                        ? overrides.placeName
                        : data.placeName,
                semantic: data.semantic ? undefined : false,
            }),
            { keepFocus: true, noScroll: true, ...nav },
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

    function onSpatialChange() {
        navigateWith({});
    }

    function onViewportSearch(bounds: SearchBBox) {
        navigateWith({ bbox: bounds, lat: null, lng: null }, { replaceState: true });
    }

    function formatDistance(m: number): string {
        if (m < 1000) return `${Math.round(m)}m`;
        return `${(m / 1000).toFixed(1)}km`;
    }

    async function loadEntities(
        slug: string,
        q: string = data.query,
        opts: { force?: boolean; limit?: number } = {},
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
            const limit = opts.limit ?? 8;
            const url = `/api/projects/${slug}/search-entities?q=${encodeURIComponent(q)}&limit=${limit}`;
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
            const scoped = (data.projectSlugs ?? []).length > 0;
            await loadEntities(slug, data.query, {
                force: true,
                limit: scoped ? 20 : 8,
            });
        }
    }

    // Prefetch once per query+slug (must not track entityCache).
    $effect(() => {
        const q = data.query;
        const projects = displayProjects;
        const scoped = (data.projectSlugs ?? []).length > 0;
        const seeded = data.entityHits ?? {};
        if (!q || !projects?.length) return;
        untrack(() => {
            if (q !== lastPrefetchQ) {
                lastPrefetchQ = q;
                entityCache = {};
                entityFetchKeys.clear();
            }
            if (scoped) {
                const next = { ...entityCache };
                const exp = { ...expanded };
                for (const p of projects) {
                    const rows = seeded[p.slug];
                    if (rows) {
                        next[p.slug] = rows;
                        entityFetchKeys.add(entityCacheKey(p.slug, q));
                    }
                    exp[p.slug] = true;
                }
                entityCache = next;
                expanded = exp;
            }
            const limit = scoped ? 20 : 8;
            const slice = scoped ? projects : projects.slice(0, 12);
            for (const p of slice) {
                void loadEntities(p.slug, q, { limit });
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

<SpatialDiscovery
    {hasSession}
    accessToken={data.accessToken}
    bind:query
    bind:centerLat
    bind:centerLng
    bind:radius
    bind:searchBBox
    bind:dateFrom
    bind:dateTo
    {tags}
    {vocabularies}
    projects={projectSlugs}
    {projectLabels}
    semantic={data.semantic}
    {mediaHash}
    {imageQuery}
    placeName={data.placeName}
    results={displayProjects}
    persistFilters
    {onTemporalCommit}
    {onSpatialChange}
    {onViewportSearch}
    autofocus={!activeQuery}
    title={data.query ? `${data.query} — Search — echidna` : "Search — echidna"}
>
    {#snippet media()}
        {#if showImageResults}
            <section class="mb-3">
                {#if isReverseImage}
                    <div class="mb-2 flex flex-wrap items-start gap-3">
                        {#if queryPreview}
                            <div
                                class="relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/50"
                            >
                                <img
                                    src={queryPreview}
                                    alt=""
                                    class="h-full w-full object-cover"
                                />
                            </div>
                        {/if}
                        <div class="min-w-0 flex-1">
                            <p class="text-xs text-foreground">
                                {#if data.imageQuery}
                                    Visually similar photos
                                {:else}
                                    Similar to catalogue photo
                                {/if}
                                {#if imageHits.length > 0}
                                    <span class="text-muted-foreground">
                                        · {imageHits.length}
                                    </span>
                                {/if}
                            </p>
                            <button
                                type="button"
                                class="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                onclick={clearImageSearch}
                            >
                                Clear image search
                            </button>
                        </div>
                    </div>
                {:else if data.query}
                    <p class="mb-2 text-xs text-muted-foreground">
                        Photos matching “{data.query}”
                        {#if imageHits.length > 0}· {imageHits.length}{/if}
                    </p>
                {/if}

                {#if data.imageQuery && !imageSession && imageHits.length === 0}
                    <p class="py-2 text-xs text-muted-foreground">
                        Query image is missing from this browser session.
                    </p>
                {:else if imageStatus && imageHits.length === 0 && isReverseImage}
                    <p class="py-2 text-xs text-muted-foreground">{imageStatus}</p>
                {:else if imageHits.length > 0}
                    <div class="grid grid-cols-4 gap-1">
                        {#each imageHits as sim (sim.hash + sim.project_slug)}
                            {@const isImage = sim.media_type.startsWith("image/")}
                            {@const imgLoaded = loadedImages.has(sim.hash)}
                            {@const imgFailed = failedImages.has(sim.hash)}
                            <a
                                href={`/${sim.project_slug}/artefacts`}
                                class="group relative aspect-square overflow-hidden rounded-md bg-secondary/60 no-underline"
                                title="{sim.project_title} · {similarityPct(sim.distance)}%"
                            >
                                {#if isImage}
                                    {#if !imgLoaded && !imgFailed}
                                        <div class="absolute inset-0 animate-pulse bg-secondary"></div>
                                    {/if}
                                    {#if imgFailed}
                                        <div class="absolute inset-0 flex items-center justify-center">
                                            <ImageOffIcon class="size-4 text-muted-foreground/40" />
                                        </div>
                                    {/if}
                                    <img
                                        src={mediaUrl(sim)}
                                        alt=""
                                        class="h-full w-full object-cover {imgLoaded
                                            ? 'opacity-100'
                                            : 'opacity-0'}"
                                        loading="lazy"
                                        onload={() => onImageLoad(sim.hash)}
                                        onerror={() => onImageError(sim.hash)}
                                    />
                                {:else}
                                    <div
                                        class="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground"
                                    >
                                        {sim.project_title}
                                    </div>
                                {/if}
                                <span
                                    class="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-1 text-[9px] tabular-nums"
                                >
                                    {similarityPct(sim.distance)}%
                                </span>
                            </a>
                        {/each}
                    </div>
                {/if}
            </section>
        {/if}
    {/snippet}

    {#snippet empty()}
        <div class="py-6 text-muted-foreground">
            <SearchIcon class="mb-2 size-6 opacity-30" />
            {#if !activeQuery}
                <p class="text-sm text-foreground">Search echidna</p>
            {:else}
                <p class="text-sm text-foreground">No projects found</p>
                <p class="mt-1 text-xs">Try different terms or a wider area.</p>
            {/if}
        </div>
    {/snippet}

    {#snippet projectExtras(proj)}
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
                            class="mb-1 space-y-1 rounded-md border border-border/50 bg-secondary/30 px-2 py-1.5"
                        >
                            {#if snippet}
                                <p class="text-[11px] leading-snug text-foreground">
                                    {@html headlineHtml(snippet, data.query)}
                                </p>
                            {:else if hits.length > 0}
                                {#each hits.slice(0, 2) as hit}
                                    <p class="truncate text-[11px]">
                                        <span class="font-mono text-muted-foreground"
                                            >{hit.entity_type}.{hit.column_name}</span
                                        >
                                        {@html highlightHtml(hit.local_value, data.query)}
                                    </p>
                                {/each}
                            {/if}
                        </div>
                    {/if}
                    {#if ents && ents.length > 0}
                        <button
                            type="button"
                            onclick={() => toggleEntities(proj.slug)}
                            class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                            {expanded[proj.slug]
                                ? "Hide entities"
                                : `In project data (${ents.length})`}
                            <ChevronDownIcon
                                class="size-3 transition-transform {expanded[proj.slug]
                                    ? 'rotate-180'
                                    : ''}"
                            />
                        </button>
                        {#if expanded[proj.slug]}
                            <div class="mt-1 space-y-0.5">
                                {#each ents as entity}
                                    <a
                                        href={entityHref(proj.slug, entity)}
                                        class="flex items-baseline gap-1.5 rounded px-1 py-0.5 text-[11px] no-underline hover:bg-accent/60 hover:text-primary"
                                    >
                                        <span class="font-mono text-muted-foreground"
                                            >{entity.entity_type}</span
                                        >
                                        <span class="truncate text-foreground">
                                            {@html highlightHtml(entity.match_value, data.query)}
                                        </span>
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    {/if}
                </div>
            {/if}
        {/if}
        {#if proj.distance_m != null}
            <p class="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <MapPinIcon class="size-3" />
                {formatDistance(proj.distance_m)}
            </p>
        {/if}
    {/snippet}
</SpatialDiscovery>

