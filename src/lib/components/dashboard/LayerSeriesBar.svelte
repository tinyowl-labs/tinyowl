<script lang="ts">
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import { SERIES_ALL, type SeriesStep } from "./layerViews";

    type Props = {
        layerName: string;
        field: string;
        steps?: SeriesStep[];
        stepKey?: string;
        onStep?: (key: string) => void;
    };

    let {
        layerName,
        field,
        steps = [],
        stepKey = SERIES_ALL,
        onStep,
    }: Props = $props();

    const max = $derived(steps.length);
    const index = $derived(
        stepKey === SERIES_ALL
            ? 0
            : Math.max(0, steps.findIndex((s) => s.key === stepKey) + 1),
    );
    const label = $derived(
        stepKey === SERIES_ALL
            ? "All"
            : (steps.find((s) => s.key === stepKey)?.label ?? stepKey),
    );
    const layerLabel = $derived(layerName.replace(/_/g, " "));

    function setIndex(i: number) {
        if (max === 0) {
            onStep?.(SERIES_ALL);
            return;
        }
        const next = Math.max(0, Math.min(max, i));
        onStep?.(next === 0 ? SERIES_ALL : steps[next - 1]!.key);
    }
</script>

<div
    class="pointer-events-auto flex w-[min(36rem,calc(100vw-12rem))] items-center gap-2 rounded-lg border border-border bg-background/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm"
    role="group"
    aria-label="Time series"
>
    <div class="min-w-0 shrink">
        <p class="truncate font-medium leading-none">{layerLabel}</p>
        <p class="mt-0.5 truncate text-[10px] text-muted-foreground">{field}</p>
    </div>
    <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
        title="Previous"
        disabled={max === 0 || index <= 0}
        onclick={() => setIndex(index - 1)}
    >
        <ChevronLeftIcon class="size-4" />
    </button>
    <input
        type="range"
        class="min-w-0 flex-1"
        min="0"
        max={Math.max(1, max)}
        step="1"
        value={index}
        disabled={max === 0}
        aria-valuetext={label}
        oninput={(e) =>
            setIndex(Number((e.currentTarget as HTMLInputElement).value))}
    />
    <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
        title="Next"
        disabled={max === 0 || index >= max}
        onclick={() => setIndex(index + 1)}
    >
        <ChevronRightIcon class="size-4" />
    </button>
    <span
        class="w-[7.5rem] shrink-0 truncate text-right tabular-nums text-muted-foreground"
        title={label}
    >
        {max === 0 ? "No values" : label}
    </span>
</div>
