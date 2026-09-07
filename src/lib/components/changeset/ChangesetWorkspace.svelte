<script lang="ts">
    import type { Snippet } from "svelte";
    import WorkspaceToolbar from "$lib/components/ui/workspace-toolbar.svelte";

    let {
        title,
        meta,
        actions,
        banner,
        sidebar,
        children,
    }: {
        title: string;
        meta?: Snippet;
        actions?: Snippet;
        banner?: Snippet;
        sidebar?: Snippet;
        children?: Snippet;
    } = $props();
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<article class="flex h-full min-h-0 flex-col overflow-hidden">
    <WorkspaceToolbar {meta} {actions} />
    {@render banner?.()}
    {#if sidebar}
        <div
            class="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]"
        >
            <div
                class="min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border max-h-[32vh] lg:max-h-none"
            >
                {@render sidebar()}
            </div>
            <div class="min-h-0 overflow-hidden flex flex-col">
                {@render children?.()}
            </div>
        </div>
    {:else}
        {@render children?.()}
    {/if}
</article>
