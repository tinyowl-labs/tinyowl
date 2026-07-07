<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import Header from "$lib/components/ui/header.svelte";
    import MobileNav from "$lib/components/ui/mobile-nav.svelte";

    let { data, children } = $props();

    const hasSession = $derived(Boolean($page.data?.user));
    const nav = $derived(data?.nav ?? []);

    function isActive(href: string) {
        const path = $page.url.pathname;
        if (path === href) return true;
        if (href !== "/docs") return path.startsWith(href + "/");
        return false;
    }

    let collapsedSections = $state<Record<string, boolean>>({});
    function toggleSection(section: string) {
        collapsedSections = {
            ...collapsedSections,
            [section]: !collapsedSections[section],
        };
    }

    let collapsed = $state(!browser || (browser && window.innerWidth < 1024));
    let mobileOpen = $state(false);

    $effect(() => {
        if (!browser) return;
        const onResize = () => {
            if (window.innerWidth >= 1024) mobileOpen = false;
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });
</script>

<svelte:head>
    <title>Docs — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle="Documentation" {hasSession} />

    <div class="flex flex-1 min-h-0">
        <!-- Desktop sidebar -->
        <aside
            class="hidden lg:flex shrink-0 border-r border-border bg-background flex-col transition-all duration-200 {collapsed
                ? 'w-12'
                : 'w-56'}"
        >
            <button
                onclick={() => (collapsed = !collapsed)}
                class="flex items-center justify-center h-10 shrink-0 border-b border-border text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
                {#if collapsed}
                    <PanelLeftIcon class="size-4" />
                {:else}
                    <PanelLeftCloseIcon class="size-4" />
                {/if}
            </button>

            <nav class="flex flex-col gap-0.5 p-1.5 overflow-y-auto flex-1">
                {#each nav as group}
                    {#if collapsed}
                        <div
                            class="flex items-center justify-center py-1.5 text-[10px] font-semibold text-muted-foreground/40 uppercase"
                            title={group.section}
                        >
                            {group.section.charAt(0)}
                        </div>
                    {:else}
                        <div class="mb-0.5">
                            <button
                                onclick={() => toggleSection(group.section)}
                                class="flex items-center justify-between w-full rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                            >
                                <span>{group.section}</span>
                                <ChevronDownIcon
                                    class="size-3.5 shrink-0 transition-transform {collapsedSections[
                                        group.section
                                    ]
                                        ? 'rotate-0'
                                        : '-rotate-90'}"
                                />
                            </button>
                            {#if !collapsedSections[group.section]}
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
                    {/if}
                {/each}
            </nav>
            {#if !collapsed}
                <div class="mt-auto p-3 border-t border-border">
                    <a
                        href="/"
                        class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                    >
                        <ChevronLeft class="size-3.5" />
                        Back to projects
                    </a>
                </div>
            {/if}
        </aside>

        <!-- Mobile navigation -->
        <MobileNav bind:open={mobileOpen} title="Documentation">
            {#snippet children()}
                <nav class="flex flex-col gap-0.5 p-3">
                    {#each nav as group}
                        <div class="mb-0.5">
                            <button
                                onclick={() => toggleSection(group.section)}
                                class="flex items-center justify-between w-full rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                            >
                                <span>{group.section}</span>
                                <ChevronDownIcon
                                    class="size-3.5 shrink-0 transition-transform {collapsedSections[
                                        group.section
                                    ]
                                        ? 'rotate-0'
                                        : '-rotate-90'}"
                                />
                            </button>
                            {#if !collapsedSections[group.section]}
                                <div class="flex flex-col gap-0.5 mt-0.5 ml-2">
                                    {#each group.items as item}
                                        <a
                                            href={item.href}
                                            onclick={() => (mobileOpen = false)}
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
                        onclick={() => (mobileOpen = false)}
                        class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                    >
                        <ChevronLeft class="size-3.5" />
                        Back to projects
                    </a>
                </div>
            {/snippet}
        </MobileNav>

        <main class="flex-1 min-h-0 overflow-y-auto bg-background">
            {@render children()}
        </main>
    </div>
</div>
