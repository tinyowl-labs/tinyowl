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
    import type { SearchProject } from "./+page.server";

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
        } satisfies SearchParams),
    );

    const resultMarkers = $derived(
        (data.projects ?? [])
            .filter((p) => p.bbox)
            .map((p) => ({
                slug: p.slug,
                title: p.title,
                bbox: p.bbox,
            })),
    );

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
        }> = {},
    ) {
        const nextBBox =
            overrides.bbox !== undefined ? overrides.bbox : searchBBox;
        const nextLat =
            overrides.lat !== undefined ? overrides.lat : centerLat;
        const nextLng =
            overrides.lng !== undefined ? overrides.lng : centerLng;
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
            }),
        );
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
        const projects = data.projects;
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
                        projects={data.projects}
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
                            Find projects by title, vocabulary, period, or place.
                            Use the filters on the left, or browse the
                            <a
                                href="/"
                                class="text-primary underline-offset-2 hover:underline"
                                >home map</a
                            >.
                        </p>
                    </div>
                {:else if data.projects.length === 0}
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
                {:else}
                    <p class="text-sm text-muted-foreground mb-3">
                        {data.projects.length} project{data.projects.length !== 1
                            ? "s"
                            : ""}
                        {#if data.query}
                            matching “{data.query}”
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
                        {#each data.projects as proj}
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
            </div>
        </div>
    </main>
</div>
