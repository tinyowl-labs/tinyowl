<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import Header from "$lib/components/ui/header.svelte";
    import SearchIcon from "@lucide/svelte/icons/search";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import HashIcon from "@lucide/svelte/icons/hash";
    import MapPinIcon from "@lucide/svelte/icons/map-pin";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import SpatialMap from "$lib/components/SpatialMap.svelte";
    import { untrack } from "svelte";

    type SearchProject = {
        slug: string;
        title: string;
        description: string | null;
        entity_count: number;
        table_count: number;
        bbox: string | null;
        match_detail: string;
        distance_m?: number;
    };

    type EntityResult = {
        entity_type: string;
        entity_id: string;
        column_name: string;
        match_value: string;
        project_slug: string;
    };

    type PageData = {
        user: any;
        accessToken: string | null;
        query: string;
        lat: number | null;
        lng: number | null;
        radius: number | null;
        dateFrom: number | null;
        dateTo: number | null;
        projects: SearchProject[];
        entities: Record<string, EntityResult[]>;
    };

    let { data }: { data: PageData } = $props();
    const hasSession = $derived(Boolean($page.data?.user));

    let query = $state(untrack(() => data.query) || "");

    // Spatial filter state
    let showMap = $state(untrack(() => data.lat !== null));
    let centerLat = $state(untrack(() => data.lat));
    let centerLng = $state(untrack(() => data.lng));
    let radius = $state(untrack(() => data.radius ?? 5000));
    let dateFrom = $state(untrack(() => data.dateFrom?.toString() ?? ""));
    let dateTo = $state(untrack(() => data.dateTo?.toString() ?? ""));

    // Result markers for the spatial map
    const resultMarkers = $derived(
        (data.projects ?? [])
            .filter((p: any) => p.bbox)
            .map((p: any) => ({
                slug: p.slug,
                title: p.title,
                bbox: p.bbox,
            })),
    );

    // Track expanded entity sections per project
    let expanded = $state<Record<string, boolean>>({});

    function toggleEntities(slug: string) {
        expanded = { ...expanded, [slug]: !expanded[slug] };
    }

    function buildParams(): URLSearchParams {
        const params = new URLSearchParams();
        const q = query.trim();
        if (q) params.set("q", q);
        if (centerLat !== null && centerLng !== null) {
            params.set("lat", centerLat.toString());
            params.set("lng", centerLng.toString());
            params.set("radius", radius.toString());
        }
        const df = dateFrom.trim();
        const dt = dateTo.trim();
        if (df !== "" && !Number.isNaN(Number(df))) params.set("date_from", df);
        if (dt !== "" && !Number.isNaN(Number(dt))) params.set("date_to", dt);
        return params;
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        goto(`/search?${buildParams().toString()}`);
    }

    function updateSpatial() {
        goto(`/search?${buildParams().toString()}`);
    }

    let spatialTimeout: ReturnType<typeof setTimeout>;

    function onLatChange() {
        clearTimeout(spatialTimeout);
        spatialTimeout = setTimeout(updateSpatial, 500);
    }

    function formatDistance(m: number): string {
        if (m < 1000) return `${Math.round(m)}m`;
        return `${(m / 1000).toFixed(1)}km`;
    }

    function formatRadius(m: number): string {
        if (m < 1000) return `${m}m`;
        return `${(m / 1000).toFixed(1)}km`;
    }

    function clearSpatial() {
        centerLat = null;
        centerLng = null;
        radius = 5000;
        updateSpatial();
    }

    function clearDates() {
        dateFrom = "";
        dateTo = "";
        goto(`/search?${buildParams().toString()}`);
    }
</script>

<svelte:head>
    <title>{data.query ? `${data.query} — Search` : "Search"} — TinyOwl</title>
</svelte:head>

<Header {hasSession} />

<div class="flex min-h-screen flex-col pt-11">
    <main class="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        <!-- Search bar -->
        <form onsubmit={handleSubmit} class="relative mb-4">
            <SearchIcon
                class="absolute left-3.5 top-3.5 z-10 size-4 text-muted-foreground"
            />
            <input
                bind:value={query}
                placeholder="Search projects, entities, periods…"
                class="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm"
            />
        </form>

        <!-- Spatial filter toggle -->
        <div class="flex flex-wrap items-center gap-3 mb-3">
            <button
                onclick={() => (showMap = !showMap)}
                class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors {showMap
                    ? 'text-primary'
                    : ''}"
            >
                <CrosshairIcon class="size-3.5" />
                Spatial filter
            </button>
            {#if centerLat !== null && centerLng !== null}
                <span class="text-xs text-muted-foreground">
                    {centerLat.toFixed(4)}, {centerLng.toFixed(4)} — {formatRadius(
                        radius,
                    )}
                </span>
                <button
                    onclick={clearSpatial}
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Clear
                </button>
            {/if}
        </div>

        <!-- Temporal year filter (astronomical: negative = BCE) -->
        <form
            onsubmit={handleSubmit}
            class="flex flex-wrap items-end gap-2 mb-6"
        >
            <label class="flex flex-col gap-1">
                <span class="text-[10px] uppercase tracking-wide text-muted-foreground"
                    >From year</span
                >
                <input
                    type="number"
                    bind:value={dateFrom}
                    placeholder="-8000"
                    class="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-[10px] uppercase tracking-wide text-muted-foreground"
                    >To year</span
                >
                <input
                    type="number"
                    bind:value={dateTo}
                    placeholder="2024"
                    class="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
            </label>
            <button
                type="submit"
                class="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
                Apply dates
            </button>
            {#if dateFrom || dateTo}
                <button
                    type="button"
                    onclick={clearDates}
                    class="text-xs text-muted-foreground hover:text-foreground"
                >
                    Clear dates
                </button>
            {/if}
            <span class="text-[10px] text-muted-foreground self-center"
                >Negative = BCE</span
            >
        </form>

        <!-- Map -->
        {#if showMap}
            <div class="mb-6">
                <SpatialMap
                    bind:centerLat
                    bind:centerLng
                    bind:radius
                    results={resultMarkers}
                    onChange={onLatChange}
                />
            </div>
        {/if}

        {#if !data.query && data.lat === null}
            <div class="text-center py-20 text-muted-foreground">
                <SearchIcon class="size-12 mx-auto mb-4 opacity-30" />
                <p class="text-lg">Search across all TinyOwl projects</p>
                <p class="text-sm mt-2">
                    Find projects by title, description, or vocabulary terms.
                    Use the spatial filter to narrow by location.
                </p>
            </div>
        {:else if data.projects.length === 0}
            <div class="text-center py-20 text-muted-foreground">
                <p class="text-lg">
                    No projects found
                    {#if data.query}
                        for "<span class="font-medium text-foreground"
                            >{data.query}</span
                        >"
                    {/if}
                    {#if data.lat !== null}
                        within {formatRadius(data.radius ?? 5000)}
                    {/if}
                </p>
                <p class="text-sm mt-2">Try a different search term or area.</p>
            </div>
        {:else}
            <p class="text-sm text-muted-foreground mb-6">
                {data.projects.length} project{data.projects.length !== 1
                    ? "s"
                    : ""}
                {#if data.query}
                    matching "<span class="font-medium text-foreground"
                        >{data.query}</span
                    >"
                {/if}
                {#if data.lat !== null}
                    within {formatRadius(data.radius ?? 5000)}
                {/if}
            </p>

            <!-- Project cards -->
            <div class="space-y-4">
                {#each data.projects as proj}
                    <div
                        class="rounded-lg border border-border bg-card overflow-hidden"
                    >
                        <a
                            href="/{proj.slug}"
                            class="block p-5 hover:bg-accent/50 transition-colors no-underline"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0 flex-1">
                                    <h2
                                        class="text-base font-semibold text-foreground truncate"
                                    >
                                        {proj.title}
                                    </h2>
                                    {#if proj.description}
                                        <p
                                            class="text-sm text-muted-foreground mt-1 line-clamp-2"
                                        >
                                            {proj.description}
                                        </p>
                                    {/if}
                                    <div
                                        class="flex items-center gap-4 mt-3 text-xs text-muted-foreground"
                                    >
                                        <span class="flex items-center gap-1">
                                            <LayersIcon class="size-3.5" />
                                            {proj.table_count} table{proj.table_count !==
                                            1
                                                ? "s"
                                                : ""}
                                        </span>
                                        <span class="flex items-center gap-1">
                                            <HashIcon class="size-3.5" />
                                            {proj.entity_count.toLocaleString()} entities
                                        </span>
                                        {#if proj.distance_m !== undefined && proj.distance_m !== null}
                                            <span
                                                class="flex items-center gap-1"
                                            >
                                                <MapPinIcon class="size-3.5" />
                                                {formatDistance(
                                                    proj.distance_m,
                                                )}
                                            </span>
                                        {/if}
                                    </div>
                                </div>
                                {#if proj.match_detail}
                                    <span
                                        class="shrink-0 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium"
                                    >
                                        {proj.match_detail}
                                    </span>
                                {/if}
                            </div>
                        </a>

                        <!-- Inline entities (if loaded) -->
                        {#if data.entities[proj.slug]?.length}
                            <div class="border-t border-border">
                                <button
                                    onclick={() => toggleEntities(proj.slug)}
                                    class="w-full flex items-center justify-between px-5 py-2.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                                >
                                    <span>
                                        {data.entities[proj.slug].length} matching
                                        entities
                                    </span>
                                    <ChevronDownIcon
                                        class="size-3.5 transition-transform {expanded[
                                            proj.slug
                                        ]
                                            ? 'rotate-180'
                                            : ''}"
                                    />
                                </button>
                                {#if expanded[proj.slug]}
                                    <div class="px-5 pb-3 space-y-1.5">
                                        {#each data.entities[proj.slug] as entity}
                                            <div
                                                class="flex items-center gap-2 text-xs"
                                            >
                                                <span
                                                    class="font-mono text-muted-foreground shrink-0"
                                                >
                                                    {entity.entity_type}
                                                </span>
                                                <span
                                                    class="text-foreground font-medium truncate"
                                                >
                                                    {entity.entity_id}
                                                </span>
                                                <span
                                                    class="text-muted-foreground truncate"
                                                >
                                                    &mdash; {entity.match_value}
                                                </span>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </main>
</div>
