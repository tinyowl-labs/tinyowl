<script lang="ts">
    import { onMount } from "svelte";
    import Header from "$lib/components/ui/header.svelte";
    import AsciiEchidna from "$lib/components/AsciiEchidna.svelte";
    import SpatialMap from "$lib/components/SpatialMap.svelte";
    import SearchComposer from "$lib/components/SearchComposer.svelte";
    import { DEFAULT_SEARCH_RADIUS, type SearchBBox } from "$lib/search/params";
    import type { Centroid } from "./+page.server";

    type PageData = {
        user: any;
        accessToken: string | null;
        centroids: Centroid[];
    };

    let isMounted = $state(false);
    let query = $state("");
    let centerLat = $state<number | null>(null);
    let centerLng = $state<number | null>(null);
    let radius = $state(DEFAULT_SEARCH_RADIUS);
    let searchBBox = $state<SearchBBox | null>(null);

    let { data }: { data: PageData } = $props();
    const hasSession = $derived(Boolean(data?.user));
    const centroids = $derived(data?.centroids ?? []);
    const resultMarkers = $derived(
        centroids.map((c) => ({
            slug: c.slug,
            title: c.title,
            lat: c.lat,
            lng: c.lng,
            bbox: null as string | null,
        })),
    );

    /** Stable list — teaches query shapes without crowding the page */
    const searchExamples = [
        "neolithic pottery",
        "bronze age anatolia",
        "roman villa",
        "zooarchaeology",
        "rock art arnhem land",
        "çatalhöyük",
    ];

    onMount(() => {
        isMounted = true;
    });
</script>

<svelte:head><title>echidna</title></svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
    <Header {hasSession} />

    <main class="flex min-h-0 flex-1 flex-col items-center px-4 py-3">
        <div class="flex h-full min-h-0 w-full max-w-6xl flex-col gap-3">
            {#if isMounted}
                <div class="search-vt-brand w-full shrink-0">
                    <span class="sr-only">echidna</span>
                    <AsciiEchidna class="mx-auto w-full max-w-3xl" compact />
                </div>
            {/if}

            <div class="relative z-30 w-full shrink-0">
                <SearchComposer
                    bind:value={query}
                    bind:lat={centerLat}
                    bind:lng={centerLng}
                    bind:radius
                    bind:bbox={searchBBox}
                    examples={searchExamples}
                    accessToken={data.accessToken}
                    shortcutHint
                    placeholder="Search projects or places…  Type @ for filters"
                    class="py-2.5 text-foreground placeholder:text-muted-foreground transition-colors dark:border-foreground/15 dark:hover:border-foreground/30"
                />
            </div>

            <div
                id="map"
                class="search-vt-home-map relative z-0 min-h-48 w-full flex-1 overflow-hidden rounded-xl"
            >
                <SpatialMap
                    bind:centerLat
                    bind:centerLng
                    bind:radius
                    bind:searchBBox
                    results={resultMarkers}
                    fitResults
                    class="h-full"
                />
            </div>
        </div>
    </main>

    <footer class="shrink-0 border-t border-border glass-panel px-4 py-2.5">
        <div
            class="mx-auto flex max-w-6xl flex-col items-center gap-2 text-xs sm:flex-row sm:justify-between"
        >
            <span class="text-muted-foreground"
                >© 2026 echidna. All rights reserved.</span
            >
            <nav
                class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
            >
                <a
                    href="/privacy"
                    class="text-muted-foreground hover:text-primary transition-colors"
                    >Privacy policy</a
                >
                <a
                    href="/terms"
                    class="text-muted-foreground hover:text-primary transition-colors"
                    >Terms</a
                >
                <a
                    href="/docs"
                    class="text-muted-foreground hover:text-primary transition-colors"
                    >Docs</a
                >
            </nav>
        </div>
    </footer>
</div>
