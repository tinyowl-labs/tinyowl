<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
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
    function isSectionCollapsed(section: string) {
        return collapsedSections[section] === true;
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
    <title>Docs — echidna</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header
        subtitle="Documentation"
        {hasSession}
        sidebarCollapsed={collapsed}
        onSidebarToggle={() => (collapsed = !collapsed)}
        sidebarToggleClass="hidden lg:inline-flex"
    />

    <div class="flex flex-1 min-h-0">
        <!-- Desktop sidebar -->
        <aside
            class="hidden lg:flex shrink-0 overflow-hidden border-r border-border transition-[width] duration-200 ease-out {collapsed
                ? 'w-12'
                : 'w-56'}"
        >
            <div class="glass-panel flex h-full w-full min-w-0 flex-col">
                <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-1.5">
                    {#each nav as group}
                        <div class="mb-0.5">
                            <button
                                onclick={() => toggleSection(group.section)}
                                class="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                                title={group.section}
                            >
                                <span
                                    class="truncate transition-opacity duration-150 {collapsed
                                        ? 'opacity-0'
                                        : 'opacity-100 delay-100'}"
                                    >{group.section}</span
                                >
                                <ChevronDownIcon
                                    class="size-3.5 shrink-0 transition-transform {isSectionCollapsed(
                                        group.section,
                                    )
                                        ? '-rotate-90'
                                        : 'rotate-0'} {collapsed
                                        ? 'opacity-0'
                                        : 'opacity-100'}"
                                />
                            </button>
                            {#if !isSectionCollapsed(group.section)}
                                <div
                                    class="ml-2 mt-0.5 flex flex-col gap-0.5 transition-opacity duration-150 {collapsed
                                        ? 'pointer-events-none opacity-0'
                                        : 'opacity-100 delay-100'}"
                                >
                                    {#each group.items as item}
                                        <a
                                            href={item.href}
                                            class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm no-underline transition-colors {isActive(
                                                item.href,
                                            )
                                                ? 'bg-secondary font-medium text-foreground'
                                                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}"
                                        >
                                            <span class="truncate"
                                                >{item.label}</span
                                            >
                                        </a>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </nav>
                <div class="mt-auto border-t border-border p-1.5">
                    <a
                        href="/"
                        class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground no-underline transition-colors hover:bg-secondary/50 hover:text-foreground"
                    >
                        <ChevronLeft class="size-3.5 shrink-0" />
                        <span
                            class="truncate transition-opacity duration-150 {collapsed
                                ? 'pointer-events-none opacity-0'
                                : 'opacity-100 delay-100'}"
                            >Back to projects</span
                        >
                    </a>
                </div>
            </div>
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
                                    class="size-3.5 shrink-0 transition-transform {isSectionCollapsed(
                                        group.section,
                                    )
                                        ? '-rotate-90'
                                        : 'rotate-0'}"
                                />
                            </button>
                            {#if !isSectionCollapsed(group.section)}
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
