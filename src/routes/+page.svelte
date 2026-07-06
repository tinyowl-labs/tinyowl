<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import { goto } from "$app/navigation";
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
    import { onMount } from "svelte";
    import { isDark } from "$lib/stores/theme.svelte";
    import Header from "$lib/components/ui/header.svelte";

    const dark = $derived(isDark());
    const cleanSvg = redthreadSvg.replace(/<style>[\s\S]*?<\/style>/, "");
    const owlSvg = $derived(
        dark
            ? cleanSvg
                  .replace(/fill:#000000/gi, "fill:currentColor")
                  .replace(/stroke:#000000/gi, "stroke:currentColor")
                  .replace(/fill:#ffffff/gi, "fill:#000000")
                  .replace(/stroke:#ffffff/gi, "stroke:#000000")
            : cleanSvg,
    );

    let isMounted = $state(false);
    let query = $state("");
    let focused = $state(false);
    let selected = $state(-1);
    let inputEl = $state<HTMLInputElement>();

    let { data } = $props();
    const hasSession = $derived(Boolean(data?.user));
    onMount(() => {
        isMounted = true;
    });

    const suggestions = [
        {
            label: "Etruscan funerary deposits near Verona",
            href: "/search?q=etruscan+funerary+verona",
        },
        {
            label: "Roman pottery in Northern Europe",
            href: "/search?q=roman+pottery+northern+europe",
        },
        {
            label: "Bronze Age burials in the Near East",
            href: "/search?q=bronze+age+burials+near+east",
        },
        {
            label: "Iron Age hillforts in Britain",
            href: "/search?q=iron+age+hillforts+britain",
        },
        {
            label: "Neolithic settlements in Southeast Asia",
            href: "/search?q=neolithic+settlements+southeast+asia",
        },
        {
            label: "Marble fragments in the Mediterranean",
            href: "/search?q=marble+fragments+mediterranean",
        },
    ];

    const results = $derived(
        query.trim()
            ? suggestions.filter((s) =>
                  s.label.toLowerCase().includes(query.toLowerCase()),
              )
            : suggestions,
    );

    const showDropdown = $derived(focused && results.length > 0);

    function handleKeydown(e: KeyboardEvent) {
        if (!showDropdown) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selected = Math.min(selected + 1, results.length - 1);
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            selected = Math.max(selected - 1, 0);
        }
        if (e.key === "Enter" && selected >= 0) {
            goto(results[selected].href);
        }
        if (e.key === "Escape") {
            query = "";
            selected = -1;
            inputEl?.blur();
        }
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        const q = query.trim();
        if (q) goto(`/search?q=${encodeURIComponent(q)}`);
    }
</script>

<svelte:head><title>TinyOwl</title></svelte:head>

<Header {hasSession} fixed />

<div class="flex min-h-screen flex-col pt-11">
    <main
        class="home-page flex flex-1 flex-col items-center w-full pt-[20vh]"
        onkeydown={handleKeydown}
    >
        {#if isMounted}
            <!-- Logo + wordmark -->
            <div class="flex flex-col items-center gap-2 mb-8">
                <div
                    class="home-logo-icon size-28 shrink-0 [&>svg]:h-full [&>svg]:w-full text-[#15110f] dark:text-[#f7f2ee]"
                >
                    {@html owlSvg}
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
                            bind:this={inputEl}
                            bind:value={query}
                            onfocus={() => (focused = true)}
                            onblur={() =>
                                setTimeout(() => (focused = false), 150)}
                            oninput={() => (selected = -1)}
                            placeholder="Search projects, entities, periods…"
                            class="w-full rounded-xl border-2 border-[#d4c8c2] dark:border-neutral-600 bg-white dark:bg-[#1a1a1a] pl-10 pr-4 py-3 text-sm text-[#15110f] dark:text-neutral-100 placeholder:text-[#a09890] dark:placeholder:text-neutral-400 focus:border-primary dark:focus:border-primary focus:outline-none shadow-sm hover:shadow-md transition-all"
                        />
                    </form>

                    {#if showDropdown}
                        <div
                            class="absolute left-0 right-0 top-full mt-2 rounded-xl bg-white dark:bg-[#1a1a1a] border border-[#d4c8c2] dark:border-neutral-600 overflow-hidden shadow-lg z-20"
                        >
                            {#each results as item, i}
                                <a
                                    href={item.href}
                                    class="flex items-center gap-3 px-4 py-3 {selected ===
                                    i
                                        ? 'bg-[#f1e8e3] dark:bg-neutral-700'
                                        : 'hover:bg-[#f8f5f3] dark:hover:bg-neutral-800'} transition-colors no-underline"
                                >
                                    <SearchIcon
                                        class="size-4 text-[#c4b8b1] dark:text-neutral-400 shrink-0"
                                    />
                                    <span
                                        class="text-sm text-[#15110f] dark:text-neutral-100"
                                        >{item.label}</span
                                    >
                                </a>
                            {/each}
                        </div>
                    {/if}
                </div>
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
    .home-header {
        background: #fbf7f5;
        border-bottom: 1px solid #eadfdb;
        color: #15110f;
    }
    :global(.dark) .home-header {
        background: #050505;
        border-bottom-color: #1f1b19;
        color: #f7f2ee;
    }
    .home-logo-text {
        color: inherit;
    }
    .home-page {
        color: #111111;
    }
    :global(.dark) .home-page {
        color: #f7f2ee;
    }
    .home-nav-link {
        position: relative;
        color: #8b817c;
        background: transparent;
    }
    .home-nav-link:hover {
        color: #15110f;
        background: #f1e8e3;
    }
    :global(.dark) .home-nav-link {
        color: #9b918b;
    }
    :global(.dark) .home-nav-link:hover {
        color: #f7f2ee;
        background: #181412;
    }
    .home-nav-signin {
        background: #15110f;
        color: #fffaf7;
    }
    .home-nav-signin:hover {
        background: #ad0000;
    }
    :global(.dark) .home-nav-signin {
        background: #f3eee8;
        color: #090807;
    }
    :global(.dark) .home-nav-signin:hover {
        background: #ff6b5f;
    }
    .home-nav-link :global(svg) {
        position: absolute;
        top: 50%;
        left: 50%;
        translate: -50% -50%;
    }
</style>
