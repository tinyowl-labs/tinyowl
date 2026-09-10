<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import {
        activeView,
        contrastColor,
        layerLegend,
        rgbaToHex,
    } from "./layerViews";
    import type { LayerData } from "./layerTypes";

    type Props = {
        layer: LayerData;
        rows?: Record<string, unknown>[];
        resolveLabel?: (
            layerName: string,
            field: string,
            value: string,
        ) => string | undefined;
        onClose?: () => void;
        class?: string;
    };

    let {
        layer,
        rows = [],
        resolveLabel,
        onClose,
        class: klass = "",
    }: Props = $props();

    const view = $derived(
        activeView(layer.views, layer.activeViewId ?? "") ?? undefined,
    );
    const field = $derived(
        view?.style.categoryField ?? view?.style.colorField ?? "",
    );
    const legend = $derived(
        layerLegend(view, rows, undefined, (v) =>
            field ? resolveLabel?.(layer.name, field, v) : undefined,
        ),
    );
    const title = $derived(
        (layer.name || "").replace(/_/g, " ") || "Legend",
    );
</script>

<div
    class="surface flex max-h-[min(28rem,55vh)] w-60 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg {klass}"
>
    <div
        class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5"
    >
        <div class="min-w-0">
            <p
                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
                Legend
            </p>
            <p class="truncate text-[11px] text-foreground" title={title}>
                {title}
            </p>
        </div>
        <button
            type="button"
            class="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Close legend"
            onclick={() => onClose?.()}
        >
            <XIcon class="size-3.5" />
        </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-2">
        {#if !legend || (legend.classes.length === 0 && !legend.ramp)}
            <p class="px-0.5 py-1 text-[10px] text-muted-foreground">
                Single symbol — no class breaks
            </p>
        {:else if legend.ramp}
            <div class="space-y-1 px-0.5">
                {#if legend.ramp.field}
                    <p
                        class="truncate text-[10px] text-muted-foreground"
                        title={legend.ramp.field}
                    >
                        {legend.ramp.field}
                    </p>
                {/if}
                <div
                    class="h-2 rounded-full border border-border/50"
                    style="background: {legend.ramp.css}"
                ></div>
                <div
                    class="flex justify-between gap-2 tabular-nums text-[10px] text-muted-foreground"
                >
                    <span>{legend.ramp.min}</span>
                    <span>{legend.ramp.max}</span>
                </div>
            </div>
        {:else}
            <ul class="space-y-0.5">
                {#each legend.classes as cls}
                    <li class="flex min-w-0 items-center gap-1.5 px-0.5 py-0.5">
                        <span
                            class="size-2.5 shrink-0 rounded-sm border"
                            style="background: {rgbaToHex(
                                cls.color,
                            )}; border-color: {rgbaToHex(
                                contrastColor(cls.color),
                            )}"
                        ></span>
                        <span
                            class="min-w-0 truncate text-[11px] text-foreground"
                            title={cls.label}>{cls.label}</span
                        >
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>
