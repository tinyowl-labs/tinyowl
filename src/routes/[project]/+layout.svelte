<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import type { Component } from "svelte";
    import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
    import GaugeIcon from "@lucide/svelte/icons/gauge";
    import ArchiveIcon from "@lucide/svelte/icons/archive";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import Settings from "@lucide/svelte/icons/settings";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import FileUpIcon from "@lucide/svelte/icons/file-up";
    import GitPullRequestIcon from "@lucide/svelte/icons/git-pull-request";
    import HistoryIcon from "@lucide/svelte/icons/history";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
    import Header from "$lib/components/ui/header.svelte";
    import MobileNav from "$lib/components/ui/mobile-nav.svelte";
    import { buttonVariants } from "$lib/components/ui/button/button.svelte";
    import { cn } from "$lib/utils.js";

    let { data, children } = $props();

    const hasSession = $derived(Boolean($page.data?.user));
    const project = $derived(data?.project);
    const role = $derived(((data as any)?.role as string) ?? "viewer");
    const canManage = $derived(role === "owner" || role === "admin");
    const canWrite = $derived(
        role === "owner" || role === "admin" || role === "collaborator",
    );
    function isWorkspacePath(pathname: string, slug: string | undefined) {
        if (!slug) return false;
        const prefix = `/${slug}/`;
        if (!pathname.startsWith(prefix)) return false;
        const rest = pathname.slice(prefix.length);
        const [head, ...tail] = rest.split("/");
        if (head === "layers" || head === "artefacts" || head === "history") {
            return true;
        }
        // Review detail only — the list at /review stays a document.
        return head === "review" && tail.length > 0 && tail[0] !== "";
    }

    const workspace = $derived(
        isWorkspacePath($page.url.pathname, data?.slug),
    );

    type NavItem = {
        label: string;
        href: string;
        icon: Component;
    };

    type NavGroup = {
        label: string;
        items: NavItem[];
    };

    const navGroups = $derived.by((): NavGroup[] => {
        const slug = data?.slug;
        const groups: NavGroup[] = [
            {
                label: "Details",
                items: [
                    {
                        label: "Overview",
                        href: `/${slug}`,
                        icon: LayoutDashboardIcon,
                    },
                ],
            },
            {
                label: "Data",
                items: [
                    {
                        label: "Layers",
                        href: `/${slug}/layers`,
                        icon: LayersIcon,
                    },
                    {
                        label: "Artefacts",
                        href: `/${slug}/artefacts`,
                        icon: ArchiveIcon,
                    },
                    ...(canWrite
                        ? [
                              {
                                  label: "Import",
                                  href: `/${slug}/import`,
                                  icon: FileUpIcon,
                              },
                          ]
                        : []),
                ],
            },
        ];
        if (canWrite) {
            groups.push({
                label: "Manage",
                items: [
                    {
                        label: "Manage",
                        href: `/${slug}/dashboard`,
                        icon: GaugeIcon,
                    },
                    {
                        label: "Reviews",
                        href: `/${slug}/review`,
                        icon: GitPullRequestIcon,
                    },
                    {
                        label: "History",
                        href: `/${slug}/history`,
                        icon: HistoryIcon,
                    },
                    {
                        label: "Mappings",
                        href: `/${slug}/mappings`,
                        icon: WaypointsIcon,
                    },
                ],
            });
        }
        return groups;
    });

    const settingsHref = $derived(
        canManage ? `/${data?.slug}/settings` : "",
    );

    function isActive(href: string) {
        const path = $page.url.pathname;
        if (path === href) return true;
        if (href !== `/${data?.slug}`) return path.startsWith(href + "/");
        return false;
    }

    function isGroupActive(group: NavGroup) {
        return group.items.some((item) => isActive(item.href));
    }

    function navTriggerClass(active: boolean) {
        return cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1 text-xs font-medium no-underline",
            active
                ? "bg-secondary text-foreground hover:bg-secondary"
                : "text-muted-foreground",
        );
    }

    let mobileOpen = $state(false);

    $effect(() => {
        if (!browser) return;
        const onResize = () => {
            if (window.innerWidth >= 768) mobileOpen = false;
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });
</script>

<svelte:head>
    <title>{project?.title ?? "Project"} — echidna</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle={project?.title} {hasSession}>
        {#snippet leading()}
            <nav
                class="ml-1 hidden items-center gap-0.5 md:flex"
                aria-label="Project"
            >
                {#each navGroups as group}
                    <div class="group/navitem relative">
                        <a
                            href={group.items[0].href}
                            class={navTriggerClass(isGroupActive(group))}
                            aria-haspopup="menu"
                            aria-current={isGroupActive(group)
                                ? "true"
                                : undefined}
                        >
                            {group.label}
                            <ChevronDownIcon class="size-3 opacity-60" />
                        </a>
                        <div
                            role="menu"
                            class="invisible absolute left-0 top-full z-50 min-w-44 -mt-1 opacity-0 pointer-events-none group-hover/navitem:visible group-hover/navitem:opacity-100 group-hover/navitem:pointer-events-auto group-focus-within/navitem:visible group-focus-within/navitem:opacity-100 group-focus-within/navitem:pointer-events-auto"
                        >
                            <div
                                class="rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                            >
                                {#each group.items as item}
                                    <a
                                        href={item.href}
                                        role="menuitem"
                                        class={cn(
                                            "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs no-underline outline-none select-none [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
                                            isActive(item.href)
                                                ? "bg-secondary font-medium text-foreground"
                                                : "text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                                        )}
                                    >
                                        <item.icon />
                                        {item.label}
                                    </a>
                                {/each}
                            </div>
                        </div>
                    </div>
                {/each}
                {#if settingsHref}
                    <a
                        href={settingsHref}
                        class={navTriggerClass(isActive(settingsHref))}
                        aria-current={isActive(settingsHref)
                            ? "page"
                            : undefined}
                    >
                        Settings
                    </a>
                {/if}
            </nav>
        {/snippet}
    </Header>

    <MobileNav
        bind:open={mobileOpen}
        title={project?.title ?? "Project"}
        toggleClass="md:hidden"
    >
        {#snippet children()}
            <nav class="flex flex-col gap-3 p-3">
                {#each navGroups as group}
                    <div>
                        <p
                            class="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                        >
                            {group.label}
                        </p>
                        <div class="flex flex-col gap-0.5">
                            {#each group.items as item}
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
                            {/each}
                        </div>
                    </div>
                {/each}
                {#if settingsHref}
                    <a
                        href={settingsHref}
                        onclick={() => (mobileOpen = false)}
                        class="flex items-center gap-3 rounded-md px-3 py-2 text-sm {isActive(
                            settingsHref,
                        )
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'} transition-colors no-underline"
                    >
                        <Settings class="size-4 shrink-0" />
                        Settings
                    </a>
                {/if}
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
        class="relative z-0 flex-1 min-h-0 bg-background {workspace
            ? 'overflow-hidden'
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
