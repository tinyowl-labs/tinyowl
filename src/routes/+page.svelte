<script lang="ts">
    import SpatialDiscovery from "$lib/components/discovery/SpatialDiscovery.svelte";
    import { DEFAULT_SEARCH_RADIUS, type SearchBBox } from "$lib/search/params";
    import type { Centroid } from "./+page.server";

    type PageData = {
        user: any;
        accessToken: string | null;
        centroids: Centroid[];
    };

    let query = $state("");
    let centerLat = $state<number | null>(null);
    let centerLng = $state<number | null>(null);
    let radius = $state(DEFAULT_SEARCH_RADIUS);
    let searchBBox = $state<SearchBBox | null>(null);

    let { data }: { data: PageData } = $props();
    const hasSession = $derived(Boolean(data?.user));
    const centroids = $derived(data?.centroids ?? []);

    const searchExamples = [
        "neolithic pottery",
        "bronze age anatolia",
        "roman villa",
        "zooarchaeology",
        "rock art arnhem land",
        "çatalhöyük",
    ];
</script>

<SpatialDiscovery
    {hasSession}
    accessToken={data.accessToken}
    bind:query
    bind:centerLat
    bind:centerLng
    bind:radius
    bind:searchBBox
    results={centroids}
    examples={searchExamples}
    shortcutHint
    title="echidna"
/>
