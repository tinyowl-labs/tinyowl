<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        meta,
        actions,
    }: {
        meta?: Snippet;
        actions?: Snippet;
    } = $props();
</script>

<header
    class="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border bg-background px-3 py-1.5"
>
    <div
        class="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground"
    >
        {@render meta?.()}
    </div>
    {#if actions}
        <div class="flex shrink-0 flex-wrap items-center gap-2">
            {@render actions()}
        </div>
    {/if}
</header>
