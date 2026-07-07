<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import Header from "$lib/components/ui/header.svelte";
    import OwlLogo from "$lib/components/ui/owl-logo.svelte";
    import ProjectMap from "$lib/components/ProjectMap.svelte";
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
    onMount(() => {
        isMounted = true;
    });

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        const q = query.trim();
        if (q) goto(`/search?q=${encodeURIComponent(q)}`);
    }
</script>

<svelte:head><title>TinyOwl</title></svelte:head>

<Header {hasSession} fixed />

<div class="flex min-h-screen flex-col pt-11">
    <main class="home-page flex flex-1 flex-col items-center w-full pt-[10vh]">
        {#if isMounted}
            <!-- Logo + wordmark -->
            <div class="flex flex-col items-center gap-2 mb-8">
                <div
                    class="home-logo-icon size-28 shrink-0 [&>svg]:h-full [&>svg]:w-full text-[#15110f] dark:text-[#f7f2ee]"
                >
                    <OwlLogo />
                </div>
                <span
                    class="text-7xl font-semibold tracking-tight text-[#8b817c] dark:text-[#9b918b]"
                    >tinyowl</span
                >
            </div>

            <!-- Search -->
            <div class="w-full max-w-2xl px-4">
                <div class="relative w-full">
                    <form onsubmit={handleSubmit}>
                        <SearchIcon
                            class="absolute left-3.5 top-3.5 z-10 size-4 text-[#a09890] dark:text-neutral-400"
                        />
                        <input
                            bind:value={query}
                            placeholder="Search projects, entities, periods…"
                            class="w-full rounded-xl border-2 border-[#d4c8c2] dark:border-neutral-600 bg-white dark:bg-[#1a1a1a] pl-10 pr-4 py-3 text-sm text-[#15110f] dark:text-neutral-100 placeholder:text-[#a09890] dark:placeholder:text-neutral-400 focus:border-primary dark:focus:border-primary focus:outline-none shadow-sm hover:shadow-md transition-all"
                        />
                    </form>
                </div>
            </div>
        {/if}

        <!-- Project map -->
        {#if centroids.length > 0}
            <div class="w-full max-w-6xl px-4 mt-10 mb-8">
                <h2
                    class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1"
                >
                    Explore projects
                </h2>
                <ProjectMap {centroids} class="h-[50vh]" />
            </div>
        {/if}
    </main>

    <footer
        class="home-footer border-t border-[#eadfdb] dark:border-[#1f1b19] bg-[#fbf7f5] dark:bg-[#050505] px-4 py-4"
    >
        <div
            class="mx-auto flex max-w-6xl flex-col items-center gap-3 text-xs sm:flex-row sm:justify-between"
        >
            <span class="text-[#8b817c] dark:text-[#7f746e]"
                >© 2026 tinyowl. All rights reserved.</span
            >
            <nav
                class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
            >
                <a
                    href="/privacy"
                    class="text-[#6f6661] dark:text-[#a79c95] hover:text-[#ad0000] dark:hover:text-[#ff6b5f] transition-colors"
                    >Privacy policy</a
                >
                <a
                    href="/terms"
                    class="text-[#6f6661] dark:text-[#a79c95] hover:text-[#ad0000] dark:hover:text-[#ff6b5f] transition-colors"
                    >Terms</a
                >
                <a
                    href="/docs"
                    class="text-[#6f6661] dark:text-[#a79c95] hover:text-[#ad0000] dark:hover:text-[#ff6b5f] transition-colors"
                    >Docs</a
                >
            </nav>
        </div>
    </footer>
</div>

<style>
    .home-page {
        color: #111111;
    }
    :global(.dark) .home-page {
        color: #f7f2ee;
    }
</style>
