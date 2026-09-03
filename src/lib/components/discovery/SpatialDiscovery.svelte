<script lang="ts">
    import type { Snippet } from "svelte";
    import Header from "$lib/components/ui/header.svelte";
    import SearchComposer from "$lib/components/SearchComposer.svelte";
    import SpatialMap from "$lib/components/SpatialMap.svelte";
    import TemporalRangeFilter from "$lib/components/TemporalRangeFilter.svelte";
    import ProjectInspector from "$lib/components/discovery/ProjectInspector.svelte";
    import CalendarIcon from "@lucide/svelte/icons/calendar";
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import MapIcon from "@lucide/svelte/icons/map";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import MinusIcon from "@lucide/svelte/icons/minus";
    import BoxIcon from "@lucide/svelte/icons/box";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import XIcon from "@lucide/svelte/icons/x";
    import { goto } from "$app/navigation";
    import {
        DEFAULT_SEARCH_RADIUS,
        formatRadius,
        formatYear,
        type SearchBBox,
    } from "$lib/search/params";
    import {
        formatMatchDetail,
        highlightHtml,
        textMatchesQuery,
    } from "$lib/search/highlight";
    import {
        projectDateLabel,
        projectInTemporalRange,
        projectIntersectsBounds,
        projectTags,
        projectWithinRadius,
        type DiscoveryProject,
    } from "$lib/search/discovery";

    type DisplayMode = "area" | "point";

    type Props = {
        hasSession: boolean;
        accessToken?: string | null;
        query?: string;
        centerLat?: number | null;
        centerLng?: number | null;
        radius?: number;
        searchBBox?: SearchBBox | null;
        dateFrom?: string;
        dateTo?: string;
        tags?: string[];
        vocabularies?: string[];
        projects?: string[];
        projectLabels?: Record<string, string>;
        semantic?: boolean;
        mediaHash?: string | null;
        imageQuery?: boolean;
        placeName?: string | null;
        results: DiscoveryProject[];
        /** When false, temporal + viewport filters stay client-side (home browse). */
        persistFilters?: boolean;
        onTemporalCommit?: (from: number | null, to: number | null) => void;
        onSpatialChange?: () => void;
        onViewportSearch?: (bounds: SearchBBox) => void;
        examples?: string[];
        shortcutHint?: boolean;
        autofocus?: boolean;
        title?: string;
        media?: Snippet;
        empty?: Snippet;
        projectExtras?: Snippet<[DiscoveryProject]>;
    };

    let {
        hasSession,
        accessToken = null,
        query = $bindable(""),
        centerLat = $bindable(null),
        centerLng = $bindable(null),
        radius = $bindable(DEFAULT_SEARCH_RADIUS),
        searchBBox = $bindable(null),
        dateFrom = $bindable(""),
        dateTo = $bindable(""),
        tags = [],
        vocabularies = [],
        projects = [],
        projectLabels = {},
        semantic = true,
        mediaHash = null,
        imageQuery = false,
        placeName = null,
        results,
        persistFilters = false,
        onTemporalCommit,
        onSpatialChange,
        onViewportSearch,
        examples = [],
        shortcutHint = false,
        autofocus = false,
        title = "echidna",
        media,
        empty,
        projectExtras,
    }: Props = $props();

    let mapRef = $state<{
        useMapArea: () => void;
        startPointMode: () => void;
        clearSpatial: () => void;
        zoomIn: () => void;
        zoomOut: () => void;
        flyToSlug: (slug: string) => void;
    } | null>(null);

    let displayMode = $state<DisplayMode>("area");
    let hoveredProjectId = $state<string | null>(null);
    let selectedProjectId = $state<string | null>(null);
    let inspectorOpen = $state(false);
    let searchAsMove = $state(false);
    let panelOpen = $state(true);
    let viewBounds = $state<SearchBBox | null>(null);
    let cursorLat = $state<number | null>(null);
    let cursorLng = $state<number | null>(null);
    let cursorZoom = $state<number | null>(null);
    let moveTimer: ReturnType<typeof setTimeout> | null = null;

    const parsedFrom = $derived(
        dateFrom !== "" && !Number.isNaN(Number(dateFrom))
            ? Number(dateFrom)
            : null,
    );
    const parsedTo = $derived(
        dateTo !== "" && !Number.isNaN(Number(dateTo))
            ? Number(dateTo)
            : null,
    );

    const visibleResults = $derived.by(() => {
        let list = results;
        if (!persistFilters) {
            list = list.filter((p) =>
                projectInTemporalRange(p, parsedFrom, parsedTo),
            );
            if (searchAsMove && viewBounds) {
                list = list.filter((p) =>
                    projectIntersectsBounds(p, viewBounds!),
                );
            } else if (searchBBox) {
                list = list.filter((p) =>
                    projectIntersectsBounds(p, searchBBox!),
                );
            } else if (centerLat != null && centerLng != null) {
                list = list.filter((p) =>
                    projectWithinRadius(p, centerLat!, centerLng!, radius),
                );
            }
        }
        return list;
    });

    const inspecting = $derived(
        inspectorOpen
            ? (visibleResults.find((p) => p.slug === selectedProjectId) ??
                  results.find((p) => p.slug === selectedProjectId) ??
                  null)
            : null,
    );

    const spatialActive = $derived(
        searchBBox != null || (centerLat != null && centerLng != null),
    );

    function orderedTags(proj: DiscoveryProject): string[] {
        const tags = projectTags(proj);
        if (!query) return tags;
        return [
            ...tags.filter((t) => textMatchesQuery(t, query)),
            ...tags.filter((t) => !textMatchesQuery(t, query)),
        ];
    }

    function onTemporal(from: number | null, to: number | null) {
        dateFrom = from != null ? String(from) : "";
        dateTo = to != null ? String(to) : "";
        onTemporalCommit?.(from, to);
    }

    function setArea() {
        displayMode = "area";
        if (persistFilters || spatialActive || searchAsMove) {
            mapRef?.useMapArea();
        }
    }

    function setPoint() {
        displayMode = "point";
        mapRef?.startPointMode();
    }

    function clearSpatial() {
        mapRef?.clearSpatial();
    }

    function onMapResultClick(slug: string) {
        selectedProjectId = slug;
        hoveredProjectId = slug;
        if (inspectorOpen) {
            mapRef?.flyToSlug(slug);
            return;
        }
        document
            .querySelector(`[data-discovery-slug="${CSS.escape(slug)}"]`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function onCardClick(slug: string) {
        selectedProjectId = slug;
        inspectorOpen = true;
        mapRef?.flyToSlug(slug);
    }

    function onCardHover(slug: string | null) {
        hoveredProjectId = slug;
    }

    function closeInspector() {
        inspectorOpen = false;
    }

    function onCursor(lat: number | null, lng: number | null, zoom: number | null) {
        if (lat != null) cursorLat = lat;
        if (lng != null) cursorLng = lng;
        if (zoom != null) cursorZoom = zoom;
    }

    function onView(bounds: SearchBBox) {
        viewBounds = bounds;
        if (!searchAsMove) return;
        if (moveTimer) clearTimeout(moveTimer);
        moveTimer = setTimeout(() => {
            onViewportSearch?.(bounds);
        }, 420);
    }

    function toggleSearchAsMove() {
        searchAsMove = !searchAsMove;
        if (searchAsMove && viewBounds) onViewportSearch?.(viewBounds);
    }

    function open3d() {
        if (selectedProjectId) {
            void goto(`/${selectedProjectId}/layers`);
        }
    }

    const railBtn =
        "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40";
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="relative h-dvh overflow-hidden bg-background text-foreground">
    <div class="search-vt-home-map absolute inset-0 z-0">
        <SpatialMap
            bind:this={mapRef}
            bind:centerLat
            bind:centerLng
            bind:radius
            bind:searchBBox
            results={visibleResults}
            fitResults={!searchAsMove && !selectedProjectId}
            lockView={searchAsMove}
            {displayMode}
            hoveredSlug={hoveredProjectId}
            selectedSlug={selectedProjectId}
            onResultClick={onMapResultClick}
            onResultHover={onCardHover}
            {onCursor}
            onViewBounds={onView}
            onChange={onSpatialChange}
            chrome={false}
            fullBleed
            showAttribution={false}
            flyPaddingLeft={panelOpen ? 380 : 24}
            class="h-full"
        />
    </div>

    <Header {hasSession} fixed />

    {#if panelOpen}
        <aside
            class="search-vt-panel glass-panel absolute top-14 bottom-9 left-4 z-40 flex w-[min(calc(100%-2rem),22.5rem)] flex-col overflow-hidden rounded-xl border border-border/70 shadow-xl"
        >
            <div class="relative z-20 shrink-0 space-y-3 p-3 pb-2">
                <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                        <SearchComposer
                            bind:value={query}
                            {tags}
                            {vocabularies}
                            {projects}
                            {projectLabels}
                            bind:lat={centerLat}
                            bind:lng={centerLng}
                            bind:radius
                            bind:bbox={searchBBox}
                            {dateFrom}
                            {dateTo}
                            {semantic}
                            {mediaHash}
                            {imageQuery}
                            placeLabel={placeName}
                            {accessToken}
                            {autofocus}
                            {examples}
                            {shortcutHint}
                            placeholder="Search projects or places…"
                            class="bg-background/55 py-2 shadow-none dark:bg-background/40"
                        />
                    </div>
                    <button
                        type="button"
                        onclick={() => (panelOpen = false)}
                        class="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Hide panel"
                        aria-label="Hide panel"
                    >
                        <PanelLeftCloseIcon class="size-4" />
                    </button>
                </div>

                {#if !inspecting}
                    <section>
                        <h2
                            class="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            <CalendarIcon class="size-3.5" />
                            Temporal
                        </h2>
                        <TemporalRangeFilter
                            projects={results}
                            bind:dateFrom
                            bind:dateTo
                            onCommit={onTemporal}
                        />
                    </section>

                    <section>
                        <h2
                            class="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                            <CrosshairIcon class="size-3.5" />
                            Spatial
                        </h2>
                        <div
                            class="grid grid-cols-2 gap-0.5 rounded-lg bg-muted/50 p-0.5 text-[11px] font-medium"
                        >
                            <button
                                type="button"
                                onclick={setArea}
                                class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 transition-colors {displayMode ===
                                'area'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'}"
                            >
                                <MapIcon class="size-3" />
                                Area
                            </button>
                            <button
                                type="button"
                                onclick={setPoint}
                                class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 transition-colors {displayMode ===
                                'point'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'}"
                            >
                                <CrosshairIcon class="size-3" />
                                Point
                            </button>
                        </div>
                        <label
                            class="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground"
                        >
                            <input
                                type="checkbox"
                                class="size-3.5 rounded border-border"
                                checked={searchAsMove}
                                onchange={toggleSearchAsMove}
                            />
                            Search as I move the map
                        </label>
                        {#if spatialActive}
                            <button
                                type="button"
                                onclick={clearSpatial}
                                class="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                                <XIcon class="size-3" />
                                Clear spatial filter
                                {#if centerLat != null && !searchBBox}
                                    · {formatRadius(radius)}
                                {/if}
                            </button>
                        {/if}
                    </section>
                {/if}
            </div>

            <div class="relative z-0 flex min-h-0 flex-1 flex-col border-t border-border/60">
                {#if inspecting}
                    <div class="flex min-h-0 flex-1 flex-col px-3">
                        <ProjectInspector
                            project={inspecting}
                            {accessToken}
                            onBack={closeInspector}
                        />
                    </div>
                {:else}
                    {#if media}
                        <div class="shrink-0 px-3 pt-3">
                            {@render media()}
                        </div>
                    {/if}
                    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                        {#if visibleResults.length === 0}
                            {#if empty}
                                {@render empty()}
                            {:else}
                                <p class="py-6 text-sm text-muted-foreground">
                                    No projects in this view.
                                </p>
                            {/if}
                        {:else}
                            <p class="mb-2 pt-3 text-xs text-muted-foreground">
                                {visibleResults.length} project{visibleResults.length !==
                                1
                                    ? "s"
                                    : ""}
                                {#if query}
                                    matching “{query}”
                                {/if}
                                {#if parsedFrom != null || parsedTo != null}
                                    · {formatYear(parsedFrom ?? -12000)}–{formatYear(
                                        parsedTo ?? 2100,
                                    )}
                                {/if}
                            </p>
                            <ul class="space-y-2">
                                {#each visibleResults as proj (proj.slug)}
                                    {@const matchLabel = formatMatchDetail(
                                        proj.match_detail ?? "",
                                    )}
                                    {@const tags = orderedTags(proj)}
                                    <li
                                        data-discovery-slug={proj.slug}
                                        class="rounded-lg border px-2.5 py-2 transition-colors {selectedProjectId ===
                                        proj.slug
                                            ? 'border-primary/70 bg-primary/10'
                                            : hoveredProjectId === proj.slug
                                              ? 'border-foreground/30 bg-accent/40'
                                              : 'border-border/70 bg-background/25 hover:border-foreground/25'}"
                                        onmouseenter={() =>
                                            onCardHover(proj.slug)}
                                        onmouseleave={() => onCardHover(null)}
                                    >
                                        <button
                                            type="button"
                                            class="flex w-full items-start justify-between gap-2 text-left"
                                            onclick={() => onCardClick(proj.slug)}
                                        >
                                            <span class="min-w-0">
                                                <span
                                                    class="block font-mono text-[11px] text-muted-foreground"
                                                    >{proj.slug}</span
                                                >
                                                <span
                                                    class="mt-0.5 block text-sm font-semibold text-foreground"
                                                >
                                                    {@html highlightHtml(
                                                        proj.title,
                                                        query,
                                                    )}
                                                </span>
                                            </span>
                                            {#if matchLabel}
                                                <span
                                                    class="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary"
                                                    >{matchLabel}</span
                                                >
                                            {/if}
                                        </button>
                                        {#if proj.description}
                                            <p
                                                class="mt-1 line-clamp-2 text-xs text-muted-foreground"
                                            >
                                                {@html highlightHtml(
                                                    proj.description,
                                                    query,
                                                )}
                                            </p>
                                        {/if}
                                        {#if tags.length}
                                            <div
                                                class="mt-1.5 flex flex-wrap gap-1"
                                            >
                                                {#each tags as tag}
                                                    <span
                                                        class="text-[11px] {textMatchesQuery(
                                                            tag,
                                                            query,
                                                        )
                                                            ? 'font-medium text-primary'
                                                            : 'text-muted-foreground'}"
                                                        >#{tag}</span
                                                    >
                                                {/each}
                                            </div>
                                        {/if}
                                        {#if projectExtras}
                                            {@render projectExtras(proj)}
                                        {/if}
                                        {#if projectDateLabel(proj)}
                                            <p
                                                class="mt-1 text-[10px] text-muted-foreground"
                                            >
                                                {projectDateLabel(proj)}
                                            </p>
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                {/if}
            </div>
        </aside>
    {:else}
        <button
            type="button"
            onclick={() => (panelOpen = true)}
            class="glass-panel absolute top-14 left-4 z-40 inline-flex size-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground shadow-lg hover:text-foreground"
            title="Show search panel"
            aria-label="Show search panel"
        >
            <PanelLeftIcon class="size-4" />
        </button>
    {/if}

    <div
        class="pointer-events-auto absolute right-3 bottom-12 z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-background/90 shadow-lg backdrop-blur-sm"
    >
        <button
            type="button"
            class={railBtn}
            title="Zoom in"
            aria-label="Zoom in"
            onclick={() => mapRef?.zoomIn()}
        >
            <PlusIcon class="size-3.5" />
        </button>
        <button
            type="button"
            class="{railBtn} border-t border-border"
            title="Zoom out"
            aria-label="Zoom out"
            onclick={() => mapRef?.zoomOut()}
        >
            <MinusIcon class="size-3.5" />
        </button>
        <button
            type="button"
            class="{railBtn} border-t border-border {selectedProjectId
                ? ''
                : 'opacity-40'}"
            title={selectedProjectId
                ? "Open 3D workspace"
                : "Select a project to open 3D"}
            aria-label="Open 3D workspace"
            disabled={!selectedProjectId}
            onclick={open3d}
        >
            <BoxIcon class="size-3.5" />
        </button>
    </div>

    <footer
        class="glass-dock absolute inset-x-0 bottom-0 z-50 flex h-8 items-center justify-between gap-3 border-t border-border px-3 text-[11px] tabular-nums text-muted-foreground"
    >
        <nav class="hidden items-center gap-3 sm:flex">
            <a href="/privacy" class="hover:text-foreground">Privacy</a>
            <a href="/terms" class="hover:text-foreground">Terms</a>
            <a href="/docs" class="hover:text-foreground">Docs</a>
            <a
                href="https://www.openstreetmap.org/copyright"
                class="hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer">© OSM</a
            >
        </nav>
        <div class="ml-auto flex items-center gap-3">
            {#if cursorZoom != null}
                <span>z {cursorZoom.toFixed(1)}</span>
            {/if}
            {#if cursorLat != null && cursorLng != null}
                <span>
                    Lat {cursorLat.toFixed(4)}
                    Lon {cursorLng.toFixed(4)}
                </span>
            {:else}
                <span>Move the map to read coordinates</span>
            {/if}
        </div>
    </footer>
</div>
