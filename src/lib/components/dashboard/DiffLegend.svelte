<script lang="ts">
    import { DIFF_OP_LEGEND } from "$lib/geoDiff";

    type Props = {
        /** Show faded/dashed "before" key (updates with distinct old geometry). */
        showBefore?: boolean;
        class?: string;
    };

    let { showBefore = false, class: klass = "" }: Props = $props();
</script>

<div
    class="pointer-events-none flex gap-2 rounded bg-background/90 px-1.5 py-1 text-[10px] text-muted-foreground shadow-sm ring-1 ring-border/60 {klass}"
>
    {#each DIFF_OP_LEGEND as item}
        <span class="inline-flex items-center gap-1">
            <i class="size-2 rounded-full {item.swatch}"></i>
            {item.label}
        </span>
    {/each}
    {#if showBefore}
        <span class="inline-flex items-center gap-1">
            <i
                class="size-2 rounded-full bg-amber-400/40 ring-1 ring-dashed ring-amber-400/80"
            ></i>
            before
        </span>
    {/if}
</div>
