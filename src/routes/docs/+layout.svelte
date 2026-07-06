<script lang="ts">
    import { page } from "$app/stores";
    import redthreadSvg from "$lib/assets/redthread.svg?raw";
    import { onMount } from "svelte";
    import { isDark } from "$lib/stores/theme.svelte";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import BookOpenIcon from "@lucide/svelte/icons/book-open";

    let { data, children } = $props();

    const dark = $derived(isDark());
    const owlSvg = $derived(
        dark
            ? redthreadSvg
                  .replace(/fill:#000000/g, "fill:currentColor")
                  .replace(/stroke:#000000/g, "stroke:currentColor")
                  .replace(/fill:#ffffff/g, "fill:#000000")
                  .replace(/stroke:#ffffff/g, "stroke:#000000")
            : redthreadSvg,
    );

    let isMounted = $state(false);
    onMount(() => (isMounted = true));

    const nav = $derived(data?.nav ?? []);

    function isActive(href: string) {
        const path = $page.url.pathname;
        if (path === href) return true;
        if (href !== "/docs") {
            return path.startsWith(href + "/");
        }
        return false;
    }

    // Track collapsed sections — all start expanded
    let collapsed = $state<Record<string, boolean>>({});
    function toggle(section: string) {
        collapsed = { ...collapsed, [section]: !collapsed[section] };
    }
</script>

<svelte:head>
    <title>Docs — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <header
        class="flex items-center gap-2 shrink-0 px-4 h-11 border-b border-border bg-background"
    >
        <a href="/" aria-label="tinyowl" class="flex items-center gap-2.5">
            <span
                class="size-5 shrink-0 inline-block [&>svg]:w-full [&>svg]:h-full text-foreground"
            >
                {#if isMounted}{@html owlSvg}{/if}
            </span>
            <span class="text-sm font-semibold text-foreground">tinyowl</span>
        </a>
        <span class="w-px h-4 shrink-0 bg-border"></span>
        <span class="text-sm font-medium text-foreground">Documentation</span>
        <div class="ml-auto flex items-center gap-1">
            <a
                href="/profile"
                class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md"
            >
                Profile
            </a>
        </div>
    </header>

    <div class="flex flex-1 min-h-0">
        <aside
            class="w-56 shrink-0 border-r border-border bg-background flex flex-col"
        >
            <nav class="flex flex-col gap-0.5 p-3 overflow-y-auto flex-1">
                {#each nav as group}
                    <div class="mb-0.5">
                        <button
                            onclick={() => toggle(group.section)}
                            class="flex items-center justify-between w-full rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                        >
                            <span>{group.section}</span>
                            <ChevronDownIcon
                                class="size-3.5 shrink-0 transition-transform {collapsed[
                                    group.section
                                ]
                                    ? 'rotate-0'
                                    : '-rotate-90'}"
                            />
                        </button>
                        {#if !collapsed[group.section]}
                            <div class="flex flex-col gap-0.5 mt-0.5 ml-2">
                                {#each group.items as item}
                                    <a
                                        href={item.href}
                                        class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm {isActive(
                                            item.href,
                                        )
                                            ? 'bg-secondary text-foreground font-medium'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'} transition-colors no-underline"
                                    >
                                        {item.label}
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </nav>
            <div class="mt-auto p-3 border-t border-border">
                <a
                    href="/"
                    class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                >
                    <ChevronLeft class="size-3.5" />
                    Back to projects
                </a>
            </div>
        </aside>

        <main class="flex-1 min-h-0 overflow-y-auto bg-background">
            {@render children()}
        </main>
    </div>
</div>
