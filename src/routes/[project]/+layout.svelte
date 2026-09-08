<script lang="ts">
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import type { Component } from "svelte";
    import GaugeIcon from "@lucide/svelte/icons/gauge";
    import ArchiveIcon from "@lucide/svelte/icons/archive";
    import MapIcon from "@lucide/svelte/icons/map";
    import TableIcon from "@lucide/svelte/icons/table";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import Settings from "@lucide/svelte/icons/settings";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import FileUpIcon from "@lucide/svelte/icons/file-up";
    import GitPullRequestIcon from "@lucide/svelte/icons/git-pull-request";
    import HistoryIcon from "@lucide/svelte/icons/history";
    import WaypointsIcon from "@lucide/svelte/icons/waypoints";
    import MobileNav from "$lib/components/ui/mobile-nav.svelte";

    let { data, children } = $props();

    const project = $derived(data?.project);
    const role = $derived(((data as any)?.role as string) ?? "viewer");
    const isMember = $derived(Boolean((data as any)?.isMember));
    const canManage = $derived(role === "owner" || role === "admin");
    const canWrite = $derived(
        role === "owner" || role === "admin" || role === "collaborator",
    );
    function isWorkspacePath(pathname: string, slug: string | undefined) {
        if (!slug) return false;
        const prefix = `/${slug}/`;
        if (!pathname.startsWith(prefix)) return false;
        const rest = pathname.slice(prefix.length);
        const [head] = rest.split("/");
        if (head === "layers" || head === "artefacts" || head === "history") {
            return true;
        }
        return head === "review";
    }

    const workspace = $derived(
        isWorkspacePath($page.url.pathname, data?.slug),
    );
    const gpkgUri = $derived(
        ((project as { gpkg_uri?: string | null })?.gpkg_uri as
            | string
            | null
            | undefined) ?? null,
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
                label: "Data",
                items: [
                    {
                        label: "Map",
                        href: `/${slug}/layers?view=map`,
                        icon: MapIcon,
                    },
                    {
                        label: "Tables",
                        href: `/${slug}/layers?view=table`,
                        icon: TableIcon,
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
                    ...(isMember
                        ? [
                              {
                                  label: "History",
                                  href: `/${slug}/history`,
                                  icon: HistoryIcon,
                              },
                          ]
                        : []),
                    ...(gpkgUri
                        ? [
                              {
                                  label: "GeoPackage",
                                  href: gpkgUri,
                                  icon: DownloadIcon,
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
                        label: "Review",
                        href: `/${slug}/review`,
                        icon: GitPullRequestIcon,
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
        const slugRoot = `/${data?.slug}`;
        const q = href.indexOf("?");
        const hrefPath = q >= 0 ? href.slice(0, q) : href;
        const hrefSearch = q >= 0 ? href.slice(q + 1) : "";
        const path = $page.url.pathname;

        if (hrefPath === slugRoot) return path === hrefPath;
        if (path !== hrefPath) return path.startsWith(hrefPath + "/");

        if (hrefPath === `${slugRoot}/layers`) {
            const want = new URLSearchParams(hrefSearch).get("view");
            const cur = $page.url.searchParams.get("view") ?? "";
            const onMap = cur === "map" || cur === "3d" || cur === "";
            if (want === "map") return onMap;
            if (want === "table") return cur === "table" || cur === "schema";
            if (!want) return onMap;
            return cur === want;
        }
        return true;
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

<div class="flex h-full flex-col overflow-hidden">
    <MobileNav
        bind:open={mobileOpen}
        title={project?.title ?? "Project"}
        titleHref={data?.slug ? `/${data.slug}` : ""}
        toggleClass="md:hidden"
    >
        {#snippet children()}
            <nav class="flex flex-col gap-3 p-3">
                {#each navGroups as group}
                    {#if group.items.length === 1}
                        {@const item = group.items[0]}
                        <a
                            href={item.href}
                            onclick={() => (mobileOpen = false)}
                            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline {isActive(
                                item.href,
                            )
                                ? 'selected'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
                        >
                            <item.icon class="size-4 shrink-0" />
                            {item.label}
                        </a>
                    {:else}
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
                                        class="flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline {isActive(
                                            item.href,
                                        )
                                            ? 'selected'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
                                    >
                                        <item.icon class="size-4 shrink-0" />
                                        {item.label}
                                    </a>
                                {/each}
                            </div>
                        </div>
                    {/if}
                {/each}
                {#if settingsHref}
                    <a
                        href={settingsHref}
                        onclick={() => (mobileOpen = false)}
                        class="flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline {isActive(
                            settingsHref,
                        )
                            ? 'selected'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
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
