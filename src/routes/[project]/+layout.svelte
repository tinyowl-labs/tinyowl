<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import ImageIcon from "@lucide/svelte/icons/image";
    import GitCommit from "@lucide/svelte/icons/git-commit";
    import Settings from "@lucide/svelte/icons/settings";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import MenuIcon from "@lucide/svelte/icons/menu";
    import XIcon from "@lucide/svelte/icons/x";
    import Header from "$lib/components/ui/header.svelte";

    let { data, children } = $props();

    const hasSession = $derived(Boolean($page.data?.user));
    const project = $derived(data?.project);
    const isMember = $derived(data?.isMember);
    const role = $derived((data?.role as string) ?? "viewer");
    const canManage = $derived(role === "owner" || role === "admin");

    const allNavItems = $derived([
        {
            label: "Overview",
            href: `/${data?.slug}`,
            icon: LayoutDashboardIcon,
        },
        { label: "Layers", href: `/${data?.slug}/layers`, icon: LayersIcon },
        { label: "Media", href: `/${data?.slug}/media`, icon: ImageIcon },
        { label: "Diffs", href: `/${data?.slug}/diffs`, icon: GitCommit },
        ...(canManage
            ? [
                  {
                      label: "Settings",
                      href: `/${data?.slug}/settings`,
                      icon: Settings,
                  },
              ]
            : []),
    ]);

    const navItems = $derived(isMember ? allNavItems : allNavItems.slice(0, 1));

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

    function closeMobile() {
        mobileOpen = false;
    }
</script>

<svelte:head>
    <title>{project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle={project?.title} {hasSession} />

    <div class="flex flex-1 min-h-0">
        <!-- Desktop sidebar (hidden on mobile) -->
        <aside
            class="hidden md:flex shrink-0 border-r border-border bg-background flex-col transition-all duration-200 {collapsed
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
                {#each navItems as item}
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

        <!-- Mobile hamburger button -->
        <button
            onclick={() => (mobileOpen = true)}
            class="md:hidden fixed bottom-4 left-4 z-[1001] flex items-center justify-center size-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
            aria-label="Menu"
        >
            <MenuIcon class="size-5" />
        </button>

        <!-- Mobile nav drawer -->
        {#if mobileOpen}
            <button
                class="fixed inset-0 z-[1000] bg-black/50 md:hidden"
                onclick={closeMobile}
                aria-label="Close menu"
            ></button>
            <aside
                class="fixed inset-y-0 left-0 z-[1001] w-64 bg-background border-r border-border flex flex-col shadow-xl md:hidden"
            >
                <div
                    class="flex items-center justify-between px-4 h-11 border-b border-border shrink-0"
                >
                    <span class="text-sm font-semibold text-foreground"
                        >{project?.title ?? "Project"}</span
                    >
                    <button
                        onclick={closeMobile}
                        class="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <XIcon class="size-4" />
                    </button>
                </div>

                <nav class="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto">
                    {#each navItems as item}
                        <a
                            href={item.href}
                            onclick={closeMobile}
                            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm {isActive(
                                item.href,
                            )
                                ? 'bg-secondary text-foreground font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'} transition-colors no-underline"
                        >
                            <item.icon class="size-4 shrink-0" />
                            {item.label}
                        </a>
                    {/each}
                </nav>

                <div class="p-3 border-t border-border">
                    <a
                        href="/"
                        onclick={closeMobile}
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors no-underline"
                    >
                        <ChevronLeft class="size-4 shrink-0" />
                        Back to projects
                    </a>
                </div>
            </aside>
        {/if}

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
