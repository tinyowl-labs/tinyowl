<script lang="ts">
    import CheckIcon from "@lucide/svelte/icons/check";
    import XIcon from "@lucide/svelte/icons/x";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import {
        DRAW_GEOM_MODES,
        type DrawGeomMode,
    } from "$lib/stores/editBuffer.svelte";

    type BufferRow = { entityId: string; table: string };

    type Props = {
        layer: string;
        mode?: DrawGeomMode;
        status?: string;
        canFinish?: boolean;
        canAddPart?: boolean;
        useHeight?: boolean;
        bufferEntries?: BufferRow[];
        onMode?: (mode: DrawGeomMode) => void;
        onUseHeight?: (on: boolean) => void;
        onFinish?: () => void;
        onAddPart?: () => void;
        onExit?: () => void;
        onBufferRemove?: (entityId: string) => void;
        onBufferClear?: () => void;
    };

    let {
        layer,
        mode = $bindable<DrawGeomMode>("Polygon"),
        status = "",
        canFinish = false,
        canAddPart = false,
        useHeight = false,
        bufferEntries = [],
        onMode,
        onUseHeight,
        onFinish,
        onAddPart,
        onExit,
        onBufferRemove,
        onBufferClear,
    }: Props = $props();

    function setMode(id: DrawGeomMode) {
        mode = id;
        onMode?.(id);
    }
</script>

<div
    class="pointer-events-auto flex max-w-[min(36rem,calc(100vw-8rem))] flex-col gap-1.5 rounded-lg border border-border bg-background/95 p-2 text-xs shadow-lg backdrop-blur-sm"
>
    <div class="flex items-center gap-2 px-0.5">
        <PencilIcon class="size-3.5 shrink-0 text-foreground" />
        <span class="min-w-0 flex-1 truncate font-medium text-foreground"
            >Editing {layer}</span
        >
        <button
            type="button"
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Exit edit mode (Tab)"
            onclick={() => onExit?.()}
        >
            Tab to exit
        </button>
    </div>

    <div class="flex flex-wrap overflow-hidden rounded-md border border-border">
        {#each DRAW_GEOM_MODES as m, i}
            <button
                type="button"
                class="px-1.5 py-1 transition-colors {i > 0
                    ? 'border-l border-border'
                    : ''} {mode === m.id
                    ? 'bg-secondary text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => setMode(m.id)}
            >
                {m.label}
            </button>
        {/each}
    </div>

    <div class="flex flex-wrap gap-1">
        <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md border px-2 py-1 {useHeight
                ? 'border-border bg-secondary font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'}"
            title={useHeight
                ? "Height on — vertices keep pick Z"
                : "Height off — drape on ground (2D)"}
            aria-pressed={useHeight}
            onclick={() => onUseHeight?.(!useHeight)}
        >
            Height
        </button>
        {#if canAddPart}
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"
                title="Close this part and start another (Enter)"
                onclick={() => onAddPart?.()}
            >
                Add part
            </button>
        {/if}
        {#if canFinish}
            <button
                type="button"
                class="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 font-medium text-foreground hover:bg-primary/20"
                title="Finish geometry (double-click)"
                onclick={() => onFinish?.()}
            >
                <CheckIcon class="size-3.5" />
                Finish
            </button>
        {/if}
    </div>

    <p class="px-0.5 text-[11px] leading-snug text-muted-foreground">
        {status}
    </p>

    {#if bufferEntries.length > 0}
        <div class="border-t border-border pt-1.5">
            <div
                class="mb-1 flex items-center justify-between gap-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
                <span>Buffer · {bufferEntries.length}</span>
                <button
                    type="button"
                    class="inline-flex items-center gap-0.5 normal-case tracking-normal hover:text-foreground"
                    title="Clear session buffer"
                    onclick={() => onBufferClear?.()}
                >
                    <XIcon class="size-3" />
                    Clear
                </button>
            </div>
            <ul class="max-h-28 space-y-0.5 overflow-y-auto">
                {#each bufferEntries as rec, i (rec.entityId)}
                    <li
                        class="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-secondary/80"
                    >
                        <span
                            class="w-3.5 shrink-0 tabular-nums text-[10px] text-muted-foreground"
                            >{i + 1}</span
                        >
                        <span class="min-w-0 flex-1 truncate">
                            <span class="text-muted-foreground"
                                >{rec.table} ·</span
                            >
                            <span class="font-medium text-foreground"
                                >{rec.entityId}</span
                            >
                        </span>
                        <button
                            type="button"
                            class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                            title="Remove"
                            onclick={() => onBufferRemove?.(rec.entityId)}
                        >
                            <XIcon class="size-3" />
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>
