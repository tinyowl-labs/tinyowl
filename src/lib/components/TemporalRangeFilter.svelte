<script lang="ts">
    import { Slider } from "bits-ui";
    import { formatYear } from "$lib/search/params";

    type DatedProject = {
        date_start?: number | null;
        date_end?: number | null;
    };

    type Props = {
        projects: DatedProject[];
        dateFrom: string;
        dateTo: string;
        onCommit: (from: number | null, to: number | null) => void;
    };

    let {
        projects = [],
        dateFrom = $bindable(""),
        dateTo = $bindable(""),
        onCommit,
    }: Props = $props();

    /** Fixed archaeological year axis — not derived from filtered results. */
    const DOMAIN_MIN = -12000;
    const DOMAIN_MAX = 2100;
    const BIN_COUNT = 48;

    type Bin = { start: number; end: number; count: number };

    const dated = $derived(
        projects
            .map((p) => {
                const s = p.date_start ?? p.date_end;
                const e = p.date_end ?? p.date_start;
                if (s == null || e == null) return null;
                return { start: Math.min(s, e), end: Math.max(s, e) };
            })
            .filter((x): x is { start: number; end: number } => x != null),
    );

    const bins = $derived.by((): Bin[] => {
        const span = DOMAIN_MAX - DOMAIN_MIN;
        const width = span / BIN_COUNT;
        const out: Bin[] = [];
        for (let i = 0; i < BIN_COUNT; i++) {
            const start = DOMAIN_MIN + i * width;
            const end = start + width;
            let count = 0;
            for (const d of dated) {
                if (d.start <= end && d.end >= start) count++;
            }
            out.push({ start, end, count });
        }
        return out;
    });

    const maxCount = $derived(Math.max(1, ...bins.map((b) => b.count)));

    let range = $state<[number, number]>([DOMAIN_MIN, DOMAIN_MAX]);

    $effect(() => {
        const parsedFrom =
            dateFrom !== "" && !Number.isNaN(Number(dateFrom))
                ? Number(dateFrom)
                : DOMAIN_MIN;
        const parsedTo =
            dateTo !== "" && !Number.isNaN(Number(dateTo))
                ? Number(dateTo)
                : DOMAIN_MAX;
        let a = Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, parsedFrom));
        let b = Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, parsedTo));
        if (a > b) [a, b] = [b, a];
        range = [a, b];
    });

    const hasFilter = $derived(dateFrom !== "" || dateTo !== "");

    const selectedLeft = $derived(
        ((range[0] - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * 100,
    );
    const selectedRight = $derived(
        ((range[1] - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * 100,
    );

    function commitValues(values: number[]) {
        let a = Math.round(values[0] ?? DOMAIN_MIN);
        let b = Math.round(values[1] ?? DOMAIN_MAX);
        if (a > b) [a, b] = [b, a];
        a = Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, a));
        b = Math.max(DOMAIN_MIN, Math.min(DOMAIN_MAX, b));
        range = [a, b];
        // Full axis = no temporal filter (Clear semantics).
        if (a <= DOMAIN_MIN && b >= DOMAIN_MAX) {
            dateFrom = "";
            dateTo = "";
            onCommit(null, null);
            return;
        }
        dateFrom = String(a);
        dateTo = String(b);
        onCommit(a, b);
    }

    function clear() {
        range = [DOMAIN_MIN, DOMAIN_MAX];
        dateFrom = "";
        dateTo = "";
        onCommit(null, null);
    }
</script>

<div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground">
            {#if dated.length === 0}
                Drag to set a year range
            {:else}
                {dated.length} dated in results
            {/if}
        </p>
        {#if hasFilter}
            <button
                type="button"
                onclick={clear}
                class="text-[11px] text-muted-foreground hover:text-foreground"
            >
                Clear
            </button>
        {/if}
    </div>

    <div
        class="relative h-16 rounded-md border border-border bg-muted/30 overflow-hidden"
    >
        <div class="absolute inset-0 flex items-end gap-px px-0.5 pt-1 pb-0">
            {#each bins as bin}
                {@const h = (bin.count / maxCount) * 100}
                {@const inRange = bin.end >= range[0] && bin.start <= range[1]}
                <div
                    class="flex-1 min-w-0 rounded-t-[1px] transition-colors {inRange
                        ? 'bg-foreground/70'
                        : 'bg-foreground/15'}"
                    style="height: {bin.count === 0 ? 2 : Math.max(4, h)}%"
                    title="{formatYear(Math.round(bin.start))}–{formatYear(
                        Math.round(bin.end),
                    )}: {bin.count}"
                ></div>
            {/each}
        </div>
        <div
            class="pointer-events-none absolute inset-y-0 left-0 bg-background/55"
            style="width: {selectedLeft}%"
        ></div>
        <div
            class="pointer-events-none absolute inset-y-0 right-0 bg-background/55"
            style="width: {100 - selectedRight}%"
        ></div>
    </div>

    <Slider.Root
        type="multiple"
        value={range}
        onValueChange={(v) => {
            if (v.length >= 2) range = [v[0], v[1]];
        }}
        onValueCommit={commitValues}
        min={DOMAIN_MIN}
        max={DOMAIN_MAX}
        step={1}
        class="relative flex w-full touch-none select-none items-center py-2"
    >
        {#snippet children({ thumbItems })}
            <span
                class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border"
            >
                <Slider.Range class="absolute h-full bg-foreground/70" />
            </span>
            {#each thumbItems as thumb (thumb.index)}
                <Slider.Thumb
                    index={thumb.index}
                    class="border-background bg-foreground focus-visible:ring-ring block size-3.5 rounded-full border-2 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
                />
            {/each}
        {/snippet}
    </Slider.Root>

    <div
        class="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground"
    >
        <span>{formatYear(Math.round(range[0]))}</span>
        <span class="text-foreground font-medium"
            >{formatYear(Math.round(range[0]))} – {formatYear(
                Math.round(range[1]),
            )}</span
        >
        <span>{formatYear(Math.round(range[1]))}</span>
    </div>
</div>
