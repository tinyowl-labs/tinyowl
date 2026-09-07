<script lang="ts">
    import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import { Button } from "$lib/components/ui/button/index.js";
    import { cn } from "$lib/utils.js";

    export type StepItem = {
        key: string;
        label: string;
        hint?: string;
    };

    type Props = {
        steps?: StepItem[];
        index?: number;
        onIndex?: (index: number) => void;
        ariaLabel?: string;
        disabled?: boolean;
        class?: string;
    };

    let {
        steps = [],
        index = 0,
        onIndex,
        ariaLabel = "Scrub",
        disabled = false,
        class: klass = "",
    }: Props = $props();

    const last = $derived(Math.max(0, steps.length - 1));
    const current = $derived(steps[index] ?? null);
    const pct = $derived(last === 0 ? 0 : (index / last) * 100);
    const showTicks = $derived(steps.length >= 2 && steps.length <= 24);
    const idle = $derived(disabled || steps.length === 0);

    function setIndex(next: number) {
        if (idle) return;
        const clamped = Math.max(0, Math.min(last, Math.round(next)));
        if (clamped === index) return;
        onIndex?.(clamped);
    }

    function onInput(ev: Event) {
        setIndex(Number((ev.currentTarget as HTMLInputElement).value));
    }
</script>

<div
    class={cn("group flex min-w-0 items-center gap-1.5", klass)}
    role="group"
    aria-label={ariaLabel}
>
    <Button
        variant="ghost"
        size="icon-xs"
        title="Previous"
        disabled={idle || index <= 0}
        onclick={() => setIndex(index - 1)}
    >
        <ChevronLeftIcon />
    </Button>
    <div class="relative mx-0.5 h-5 min-w-[6rem] flex-1">
        <div
            class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border"
        >
            <div
                class="h-full rounded-full bg-foreground/70"
                style="width: {pct}%"
            ></div>
        </div>
        {#if showTicks}
            <div
                class="pointer-events-none absolute inset-x-[5px] top-1/2 flex -translate-y-1/2 justify-between"
                aria-hidden="true"
            >
                {#each steps as step, i (step.key)}
                    <span
                        class="size-1 rounded-full {i <= index
                            ? 'bg-foreground'
                            : 'bg-muted-foreground/35'}"
                    ></span>
                {/each}
            </div>
        {/if}
        <div
            class="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-ring"
            style="left: {pct}%"
            aria-hidden="true"
        ></div>
        <input
            type="range"
            class="step-scrubber-input absolute inset-0 w-full cursor-pointer"
            min="0"
            max={last}
            step="1"
            value={index}
            disabled={idle}
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={index}
            aria-valuetext={current?.label ?? ""}
            title={current?.hint || current?.label || ""}
            oninput={onInput}
        />
    </div>
    <Button
        variant="ghost"
        size="icon-xs"
        title="Next"
        disabled={idle || index >= last}
        onclick={() => setIndex(index + 1)}
    >
        <ChevronRightIcon />
    </Button>
    <div class="min-w-0 max-w-[11rem] shrink-0 text-right leading-tight">
        <p class="truncate text-xs text-foreground" title={current?.label ?? ""}>
            {idle ? "—" : (current?.label ?? "")}
        </p>
        {#if current?.hint}
            <p class="truncate text-[10px] text-muted-foreground">
                {current.hint}
            </p>
        {/if}
    </div>
</div>

<style>
    .step-scrubber-input {
        appearance: none;
        background: transparent;
        margin: 0;
    }
    .step-scrubber-input:focus-visible {
        outline: none;
    }
    .step-scrubber-input::-webkit-slider-runnable-track {
        height: 1.25rem;
        background: transparent;
    }
    .step-scrubber-input::-webkit-slider-thumb {
        appearance: none;
        width: 14px;
        height: 14px;
        border: none;
        background: transparent;
        cursor: pointer;
    }
    .step-scrubber-input::-moz-range-track {
        height: 1.25rem;
        background: transparent;
        border: none;
    }
    .step-scrubber-input::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: none;
        background: transparent;
        cursor: pointer;
    }
    .step-scrubber-input:disabled {
        cursor: default;
    }
</style>
