<script lang="ts">
    import { SERIES_ALL, type SeriesStep } from "./layerViews";
    import StepScrubber, {
        type StepItem,
    } from "$lib/components/ui/step-scrubber.svelte";

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

    const items = $derived<StepItem[]>([
        { key: SERIES_ALL, label: "All" },
        ...steps.map((s) => ({ key: s.key, label: s.label })),
    ]);
    const index = $derived(
        Math.max(
            0,
            items.findIndex((s) => s.key === stepKey),
        ),
    );
    const layerLabel = $derived(layerName.replace(/_/g, " "));

    function onIndex(i: number) {
        onStep?.(items[i]?.key ?? SERIES_ALL);
    }
</script>

<div
    class="surface pointer-events-auto flex w-[min(36rem,calc(100vw-12rem))] items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs shadow-lg"
    role="group"
    aria-label="Time series"
>
    <div class="min-w-0 max-w-[8.5rem] shrink-0">
        <p class="truncate font-medium leading-none">{layerLabel}</p>
        <p class="mt-0.5 truncate text-[10px] text-muted-foreground">{field}</p>
    </div>
    <StepScrubber
        class="min-w-0 flex-1"
        steps={items}
        {index}
        {onIndex}
        ariaLabel="Time series"
        disabled={steps.length === 0}
    />
</div>
