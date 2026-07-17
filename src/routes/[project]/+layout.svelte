<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
    import GaugeIcon from "@lucide/svelte/icons/gauge";
    import ArchiveIcon from "@lucide/svelte/icons/archive";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import Settings from "@lucide/svelte/icons/settings";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import FileUpIcon from "@lucide/svelte/icons/file-up";
    import Header from "$lib/components/ui/header.svelte";
    import MobileNav from "$lib/components/ui/mobile-nav.svelte";

    let { data, children } = $props();

    const hasSession = $derived(Boolean($page.data?.user));
    const project = $derived(data?.project);
    const role = $derived(((data as any)?.role as string) ?? "viewer");
    const canManage = $derived(role === "owner" || role === "admin");
    const canWrite = $derived(
        role === "owner" || role === "admin" || role === "collaborator",
    );

    const allNavItems = $derived([
        {
            label: "Overview",
            href: `/${data?.slug}`,
            icon: LayoutDashboardIcon,
        },
        {
            label: "Layers",
            href: `/${data?.slug}/layers`,
            icon: LayersIcon,
        },
        {
            label: "Artefacts",
            href: `/${data?.slug}/artefacts`,
            icon: ArchiveIcon,
        },
        // Separator before privileged routes (dashboard = collaborator+; settings = admin+)
        ...(canWrite || canManage
            ? [
                  {
                      separator: true,
                      href: "",
                      label: "",
                      icon: LayoutDashboardIcon,
                  },
                  ...(canWrite
                      ? [
                            {
                                label: "Manage",
                                href: `/${data?.slug}/dashboard`,
                                icon: GaugeIcon,
                            },
                            {
                                label: "Import",
                                href: `/${data?.slug}/import`,
                                icon: FileUpIcon,
                            },
                        ]
                      : []),
                  ...(canManage
                      ? [
                            {
                                label: "Settings",
                                href: `/${data?.slug}/settings`,
                                icon: Settings,
                            },
                        ]
                      : []),
              ]
            : []),
    ]);

    function isActive(href: string) {
        const path = $page.url.pathname;
        if (path === href) return true;
        if (href !== `/${data?.slug}`) return path.startsWith(href + "/");
        return false;
    }

    let collapsed = $state(!browser || (browser && window.innerWidth < 768));
    let mobileOpen = $state(false);

    $effect(() => {
        if (!browser) return;
        const onResize = () => {
            if (window.innerWidth >= 768) mobileOpen = false;
            if (window.innerWidth < 768) collapsed = true;
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });
</script>

<svelte:head>
    <title>{project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle={project?.title} {hasSession} />

    <div class="flex flex-1 min-h-0">
        <!-- Desktop sidebar (hidden on mobile) -->
        <aside
            class="hidden md:flex shrink-0 border-r border-border glass-panel flex-col transition-all duration-200 {collapsed
                ? 'w-12'
                : 'w-44'}"
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

            <nav class="flex flex-col gap-0.5 p-1.5 flex-1 overflow-y-auto">
                {#each allNavItems as item}
                    {#if item.separator}
                        <div
                            class="my-1 border-t border-border {collapsed
                                ? 'mx-1'
                                : 'mx-2'}"
                        ></div>
                    {:else}
                        <a
                            href={item.href}
                            title={collapsed ? item.label : undefined}
                            class="flex items-center gap-2.5 rounded-md {collapsed
                                ? 'justify-center px-0 py-1.5'
                                : 'px-3 py-1.5'} text-sm {isActive(item.href)
                                ? 'bg-secondary text-foreground font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'} transition-colors no-underline"
                        >
                            <item.icon class="size-4 shrink-0" />
                            {#if !collapsed}
                                <span class="truncate">{item.label}</span>
                            {/if}
                        </a>
                    {/if}
                {/each}
            </nav>

            <div class="mt-auto border-t border-border">
                <a
                    href="/"
                    class="flex items-center gap-2 rounded-md {collapsed
                        ? 'justify-center px-0 py-1.5 m-1.5'
                        : 'px-3 py-1.5 m-3'} text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                >
                    <ChevronLeft class="size-3.5 shrink-0" />
                    {#if !collapsed}
                        Back to projects
                    {/if}
                </a>
            </div>
        </aside>

        <!-- Mobile navigation -->
        <MobileNav bind:open={mobileOpen} title={project?.title ?? "Project"}>
            {#snippet children()}
                <nav class="flex flex-col gap-0.5 p-3">
                    {#each allNavItems as item}
                        {#if item.separator}
                            <div class="my-1 border-t border-border mx-2"></div>
                        {:else}
                            <a
                                href={item.href}
                                onclick={() => (mobileOpen = false)}
                                class="flex items-center gap-3 rounded-md px-3 py-2 text-sm {isActive(
                                    item.href,
                                )
                                    ? 'bg-secondary text-foreground font-medium'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'} transition-colors no-underline"
                            >
                                <item.icon class="size-4 shrink-0" />
                                {item.label}
                            </a>
                        {/if}
                    {/each}
                </nav>
                <div class="p-3 border-t border-border">
                    <a
                        href="/"
                        onclick={() => (mobileOpen = false)}
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                    >
                        <ChevronLeft class="size-4 shrink-0" />
                        Back to projects
                    </a>
                </div>
            {/snippet}
        </MobileNav>

        <main class="flex-1 min-h-0 overflow-y-auto bg-background">
            {#if project}
                {@render children()}
            {:else}
                <div class="flex items-center justify-center h-full">
                    <div class="text-center p-10 max-w-md">
                        <h2 class="text-lg font-semibold text-foreground mb-2">
                            Project not found
                        </h2>
                        <p class="text-sm text-muted-foreground">
                            This project doesn't exist or you don't have access.
                        </p>
                    </div>
                </div>
            {/if}
        </main>
    </div>
</div>
