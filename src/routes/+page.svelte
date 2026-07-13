<script lang="ts">
    import { onMount } from "svelte";
    import Header from "$lib/components/ui/header.svelte";
    import OwlLogo from "$lib/components/ui/owl-logo.svelte";
    import ProjectMap from "$lib/components/ProjectMap.svelte";
    import SearchComposer from "$lib/components/SearchComposer.svelte";
    import type { Centroid } from "./+page.server";

    type PageData = {
        user: any;
        accessToken: string | null;
        centroids: Centroid[];
    };

    let isMounted = $state(false);
    let query = $state("");

    let { data }: { data: PageData } = $props();
    const hasSession = $derived(Boolean(data?.user));
    const centroids = $derived(data?.centroids ?? []);

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

<svelte:head><title>TinyOwl</title></svelte:head>

<Header {hasSession} fixed />

<div class="flex min-h-screen flex-col pt-11 bg-background text-foreground">
    <main class="flex flex-1 flex-col items-center w-full pt-[10vh]">
        {#if isMounted}
            <div class="search-vt-brand flex flex-col items-center gap-2 mb-8">
                <div
                    class="size-28 shrink-0 [&>svg]:h-full [&>svg]:w-full text-foreground"
                >
                    <OwlLogo />
                </div>
                <span
                    class="text-7xl font-semibold tracking-tight text-muted-foreground"
                    >tinyowl</span
                >
            </div>

            <div class="relative z-30 w-full max-w-2xl px-4">
                <SearchComposer
                    bind:value={query}
                    examples={searchExamples}
                    accessToken={data.accessToken}
                    class="border-2 border-border bg-card text-foreground placeholder:text-muted-foreground hover:shadow-md transition-all"
                />
            </div>
        {/if}

        {#if centroids.length > 0}
            <div class="search-vt-home-map relative z-0 w-full max-w-6xl px-4 mt-10 mb-8">
                <ProjectMap {centroids} class="h-[50vh]" />
            </div>
        {/if}
    </main>

    <footer class="border-t border-border glass-panel px-4 py-4">
        <div
            class="mx-auto flex max-w-6xl flex-col items-center gap-3 text-xs sm:flex-row sm:justify-between"
        >
            <span class="text-muted-foreground"
                >© 2026 tinyowl. All rights reserved.</span
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
