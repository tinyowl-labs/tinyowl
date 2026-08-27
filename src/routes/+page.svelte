<script lang="ts">
    import { onMount } from "svelte";
    import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
    import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
    import MapIcon from "@lucide/svelte/icons/map";
    import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
    import Header from "$lib/components/ui/header.svelte";
    import AsciiEchidna from "$lib/components/AsciiEchidna.svelte";
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
    let mapEl = $state<HTMLElement | null>(null);

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

    const prompts = $derived([
        {
            title: "Start a project",
            body: "Create a project, import a GeoPackage, and invite collaborators.",
            href: hasSession ? "/digitize" : "/auth/login",
            cta: hasSession ? "Create project" : "Sign in to create",
            icon: FolderPlusIcon,
        },
        {
            title: "Open a project",
            body: "Pick up where you left off — projects, sync, and pending reviews.",
            href: hasSession ? "/profile" : "/auth/login",
            cta: hasSession ? "Your projects" : "Sign in",
            icon: FolderOpenIcon,
        },
        {
            title: "Explore the map",
            body: "Browse field projects by location.",
            href: "#map",
            cta: "Jump to map",
            icon: MapIcon,
            onClick: () =>
                mapEl?.scrollIntoView({ behavior: "smooth", block: "start" }),
        },
    ]);

    onMount(() => {
        isMounted = true;
    });
</script>

<svelte:head><title>echidna</title></svelte:head>

<Header {hasSession} fixed />

<div class="flex min-h-screen flex-col pt-11 bg-background text-foreground">
    <main class="flex flex-1 flex-col items-center w-full pt-[3vh] pb-12">
        <div class="flex w-full max-w-5xl flex-col px-4">
            {#if isMounted}
                <div class="search-vt-brand mb-5 w-full">
                    <span class="sr-only">echidna</span>
                    <AsciiEchidna class="w-full max-w-3xl mx-auto" compact />
                </div>

                <div class="relative z-30 w-full">
                    <SearchComposer
                        bind:value={query}
                        examples={searchExamples}
                        accessToken={data.accessToken}
                        shortcutHint
                        placeholder="Search projects…  Type @ for filters"
                        class="text-foreground placeholder:text-muted-foreground transition-colors dark:border-foreground/15 dark:hover:border-foreground/30"
                    />
                </div>

                <div class="mt-8 grid w-full gap-3 sm:grid-cols-3">
                    {#each prompts as prompt}
                        {@const Icon = prompt.icon}
                        {#if prompt.onClick}
                            <button
                                type="button"
                                onclick={prompt.onClick}
                                class="group flex flex-col items-start gap-3 rounded-lg border border-border bg-background p-5 text-left shadow-sm transition-colors hover:border-foreground/25 dark:border-foreground/15 dark:bg-muted dark:shadow-none dark:hover:border-foreground/30 dark:hover:bg-muted/80"
                            >
                                <span
                                    class="flex size-8 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground group-hover:text-foreground dark:border-foreground/15 dark:bg-background/40"
                                >
                                    <Icon class="size-4" />
                                </span>
                                <div class="flex flex-col gap-1.5">
                                    <span
                                        class="text-sm font-medium text-foreground"
                                        >{prompt.title}</span
                                    >
                                    <span
                                        class="text-xs leading-relaxed text-muted-foreground"
                                        >{prompt.body}</span
                                    >
                                </div>
                                <span
                                    class="mt-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground"
                                >
                                    {prompt.cta}
                                    <ArrowRightIcon
                                        class="size-3 opacity-60 transition-transform group-hover:translate-x-0.5"
                                    />
                                </span>
                            </button>
                        {:else}
                            <a
                                href={prompt.href}
                                class="group flex flex-col items-start gap-3 rounded-lg border border-border bg-background p-5 text-left shadow-sm no-underline transition-colors hover:border-foreground/25 dark:border-foreground/15 dark:bg-muted dark:shadow-none dark:hover:border-foreground/30 dark:hover:bg-muted/80"
                            >
                                <span
                                    class="flex size-8 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground group-hover:text-foreground dark:border-foreground/15 dark:bg-background/40"
                                >
                                    <Icon class="size-4" />
                                </span>
                                <div class="flex flex-col gap-1.5">
                                    <span
                                        class="text-sm font-medium text-foreground"
                                        >{prompt.title}</span
                                    >
                                    <span
                                        class="text-xs leading-relaxed text-muted-foreground"
                                        >{prompt.body}</span
                                    >
                                </div>
                                <span
                                    class="mt-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground"
                                >
                                    {prompt.cta}
                                    <ArrowRightIcon
                                        class="size-3 opacity-60 transition-transform group-hover:translate-x-0.5"
                                    />
                                </span>
                            </a>
                        {/if}
                    {/each}
                </div>
            {/if}

            {#if centroids.length > 0}
                <div
                    bind:this={mapEl}
                    id="map"
                    class="search-vt-home-map relative z-0 mt-10 w-full scroll-mt-16 overflow-hidden rounded-xl"
                >
                    <ProjectMap {centroids} class="h-[32vh] min-h-56" />
                </div>
            {/if}
        </div>
    </main>

    <footer class="border-t border-border glass-panel px-4 py-4">
        <div
            class="mx-auto flex max-w-5xl flex-col items-center gap-3 text-xs sm:flex-row sm:justify-between"
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
