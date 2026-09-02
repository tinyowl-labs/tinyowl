<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
    import GaugeIcon from "@lucide/svelte/icons/gauge";
    import ArchiveIcon from "@lucide/svelte/icons/archive";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import Settings from "@lucide/svelte/icons/settings";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import FileUpIcon from "@lucide/svelte/icons/file-up";
    import GitPullRequestIcon from "@lucide/svelte/icons/git-pull-request";
    import HistoryIcon from "@lucide/svelte/icons/history";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
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
    const fullBleed = $derived(
        /\/(history|review)\b/.test($page.url.pathname),
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
                                label: "Reviews",
                                href: `/${data?.slug}/review`,
                                icon: GitPullRequestIcon,
                            },
                            {
                                label: "History",
                                href: `/${data?.slug}/history`,
                                icon: HistoryIcon,
                            },
                            {
                                label: "Mappings",
                                href: `/${data?.slug}/mappings`,
                                icon: WaypointsIcon,
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
    <title>{project?.title ?? "Project"} — echidna</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header
        subtitle={project?.title}
        {hasSession}
        sidebarCollapsed={collapsed}
        onSidebarToggle={() => (collapsed = !collapsed)}
    />

    <div class="flex flex-1 min-h-0">
        <!-- Desktop sidebar (hidden on mobile) -->
        <aside
            class="hidden md:flex shrink-0 overflow-hidden border-r border-border transition-[width] duration-200 ease-out {collapsed
                ? 'w-12'
                : 'w-44'}"
        >
            <div class="glass-panel flex h-full w-full min-w-0 flex-col">
                <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-1.5">
                    {#each allNavItems as item}
                        {#if item.separator}
                            <div class="mx-2 my-1 border-t border-border"></div>
                        {:else}
                            <a
                                href={item.href}
                                title={item.label}
                                class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm no-underline transition-colors {isActive(
                                    item.href,
                                )
                                    ? 'bg-secondary font-medium text-foreground'
                                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}"
                            >
                                <item.icon class="size-4 shrink-0" />
                                <span
                                    class="truncate transition-opacity duration-150 {collapsed
                                        ? 'pointer-events-none opacity-0'
                                        : 'opacity-100 delay-100'}"
                                    >{item.label}</span
                                >
                            </a>
                        {/if}
                    {/each}
                </nav>

                <div class="mt-auto border-t border-border">
                    <a
                        href="/"
                        class="m-1.5 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground no-underline transition-colors hover:bg-secondary/50 hover:text-foreground"
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

        <main
            class="flex-1 min-h-0 bg-background {fullBleed
                ? 'relative overflow-hidden'
                : 'overflow-y-auto'}"
        >
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
