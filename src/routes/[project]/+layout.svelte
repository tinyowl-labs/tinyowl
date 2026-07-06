<script lang="ts">
    import { page } from "$app/stores";
    import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
    import LayersIcon from "@lucide/svelte/icons/layers";
    import ImageIcon from "@lucide/svelte/icons/image";
    import GitCommit from "@lucide/svelte/icons/git-commit";
    import Settings from "@lucide/svelte/icons/settings";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import Header from "$lib/components/ui/header.svelte";

    let { data, children } = $props();

    const hasSession = $derived(Boolean($page.data?.user));
    const project = $derived(data?.project);
    const isMember = $derived(data?.isMember);

    const allNavItems = $derived([
        {
            label: "Overview",
            href: `/${data?.slug}`,
            icon: LayoutDashboardIcon,
        },
        { label: "Layers", href: `/${data?.slug}/layers`, icon: LayersIcon },
        { label: "Media", href: `/${data?.slug}/media`, icon: ImageIcon },
        { label: "Diffs", href: `/${data?.slug}/diffs`, icon: GitCommit },
        { label: "Settings", href: `/${data?.slug}/settings`, icon: Settings },
    ]);

    const navItems = $derived(isMember ? allNavItems : allNavItems.slice(0, 1));

    function isActive(href: string) {
        const path = $page.url.pathname;
        if (path === href) return true;
        // Sub-routes only highlight for non-root paths (so Overview doesn't stick)
        if (href !== `/${data?.slug}`) {
            return path.startsWith(href + "/");
        }
        return false;
    }
</script>

<svelte:head>
    <title>{project?.title ?? "Project"} — TinyOwl</title>
</svelte:head>

<div class="flex flex-col h-screen overflow-hidden">
    <Header subtitle={project?.title} {hasSession} />

    <div class="flex flex-1 min-h-0">
        <aside
            class="w-44 shrink-0 border-r border-border bg-background flex flex-col"
        >
            <nav class="flex flex-col gap-0.5 p-3">
                {#each navItems as item}
                    <a
                        href={item.href}
                        class="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm {isActive(
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
