<script lang="ts">
    import SunIcon from "@lucide/svelte/icons/sun";
    import MoonIcon from "@lucide/svelte/icons/moon";
    import SearchIcon from "@lucide/svelte/icons/search";
    import { goto } from "$app/navigation";
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
    import { onMount } from "svelte";
    import { setPreference, isDark } from "$lib/stores/theme.svelte";

    const dark = $derived(isDark());
    // Strip the SVG's own dark-mode style block — it conflicts with our class‑based theming
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

    function toggleTheme() {
        setPreference("bgBase", isDark() ? "paper" : "dark");
    }

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

<header
    class="home-header fixed top-0 inset-x-0 z-50 flex h-11 shrink-0 items-center justify-between px-4"
>
    <a
        href="/"
        aria-label="tinyowl"
        class="home-logo-text text-sm font-semibold">tinyowl</a
    >
    <nav class="flex items-center gap-1">
        <button
            type="button"
            onclick={toggleTheme}
            class="home-nav-link rounded-md p-1.5"
            aria-label="Toggle theme"
        >
            <SunIcon
                class="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
            />
            <MoonIcon
                class="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
            />
        </button>
        <a
            href="/docs"
            class="home-nav-link rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            >Docs</a
        >
        {#if hasSession}
            <a
                href="/profile"
                class="home-nav-link rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                >Profile</a
            >
        {:else}
            <a
                href="/auth/login"
                class="home-nav-signin cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors no-underline inline-block"
                >Sign in</a
            >
        {/if}
    </nav>
</header>

<main
    class="home-page flex flex-col items-center justify-center min-h-screen w-full bg-white dark:bg-black"
    onkeydown={handleKeydown}
>
    {#if isMounted}
        <!-- Logo + wordmark -->
        <div class="flex items-center gap-3 mb-8">
            <div
                class="home-logo-icon size-20 shrink-0 [&>svg]:h-full [&>svg]:w-full text-[#15110f] dark:text-[#f7f2ee]"
            >
                {@html owlSvg}
            </div>
            <span
                class="text-3xl font-semibold tracking-tight text-[#15110f] dark:text-[#f7f2ee]"
                >tinyowl</span
            >
        </div>

        <!-- Search -->
        <div class="w-full max-w-xl px-4">
            <div class="relative w-full">
                <form onsubmit={handleSubmit}>
                    <SearchIcon
                        class="absolute left-3.5 top-3.5 z-10 size-4 text-[#8b817c] dark:text-neutral-500"
                    />
                    <input
                        bind:this={inputEl}
                        bind:value={query}
                        onfocus={() => (focused = true)}
                        onblur={() => setTimeout(() => (focused = false), 150)}
                        oninput={() => (selected = -1)}
                        placeholder="Search projects, entities, periods…"
                        class="w-full rounded-xl border border-[#eadfdb] dark:border-neutral-800 bg-white dark:bg-[#0B0B0B] pl-10 pr-4 py-3 text-sm text-[#15110f] dark:text-neutral-200 placeholder:text-[#c4b8b1] dark:placeholder:text-neutral-600 focus:border-[#8b817c] dark:focus:border-neutral-700 focus:outline-none transition-colors"
                    />
                </form>

                {#if showDropdown}
                    <div
                        class="absolute left-0 right-0 top-full mt-2 rounded-xl bg-white dark:bg-[#121212] border border-[#eadfdb] dark:border-neutral-800 overflow-hidden shadow-lg z-20"
                    >
                        {#each results as item, i}
                            <a
                                href={item.href}
                                class="flex items-center gap-3 px-4 py-3 {selected ===
                                i
                                    ? 'bg-[#f1e8e3] dark:bg-neutral-800'
                                    : 'hover:bg-[#f8f5f3] dark:hover:bg-neutral-800/50'} transition-colors no-underline"
                            >
                                <SearchIcon
                                    class="size-4 text-[#c4b8b1] dark:text-neutral-500 shrink-0"
                                />
                                <span
                                    class="text-sm text-[#15110f] dark:text-neutral-200"
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
