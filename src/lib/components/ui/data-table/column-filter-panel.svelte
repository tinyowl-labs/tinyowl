<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import { untrack } from "svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import type { LookupOpt } from "$lib/project/schemaFields";
    import {
        EXCEL_OPS,
        asConditionFilter,
        asValuesFilter,
        excelOpNeedsValue,
        type ExcelColumnFilter,
        type ExcelConditionOp,
    } from "./excel-filter";

    /** Excel cap — checklist stays usable on long tables. */
    const MAX_VALUES = 500;

    type Props = {
        columnId: string;
        data: Record<string, unknown>[];
        filterValue: unknown;
        lookups?: LookupOpt[];
        formatValue?: (raw: unknown) => string;
        onApply: (filter: ExcelColumnFilter | undefined) => void;
        onClear: () => void;
    };

    let {
        columnId,
        data,
        filterValue,
        lookups,
        formatValue,
        onApply,
        onClear,
    }: Props = $props();

    function rawOf(row: Record<string, unknown>): string {
        const v = row[columnId];
        return v == null ? "" : String(v);
    }

    function labelFor(raw: string): string {
        if (raw === "") return "(Blanks)";
        const hit = lookups?.find((o) => o.id === raw);
        if (hit) return hit.label;
        if (formatValue) return formatValue(raw);
        return raw;
    }

    // The panel mounts fresh on each popover open, so the value list and
    // filter seeds below are mount-time snapshots — no reactivity needed.
    function computeRaws() {
        const counts = new Map<string, number>();
        for (const row of data) {
            const raw = rawOf(row);
            counts.set(raw, (counts.get(raw) ?? 0) + 1);
        }
        const entries = [...counts.entries()].map(([raw, count]) => ({
            raw,
            count,
            label: labelFor(raw),
        }));
        entries.sort((a, b) =>
            a.raw === ""
                ? 1
                : b.raw === ""
                  ? -1
                  : a.label.toLowerCase() < b.label.toLowerCase()
                    ? -1
                    : a.label.toLowerCase() > b.label.toLowerCase()
                      ? 1
                      : 0,
        );
        return entries;
    }

    const allRaws = untrack(() => computeRaws());
    const truncated = allRaws.length > MAX_VALUES;
    const listed = allRaws.slice(0, MAX_VALUES);
    const seedCondition = untrack(() => asConditionFilter(filterValue));
    const seedValues = untrack(() => asValuesFilter(filterValue));

    // Seed local state from the live filter.
    let mode = $state<"values" | "condition">(
        seedCondition ? "condition" : "values",
    );
    let search = $state("");
    let checked = $state<Set<string>>(
        new Set(seedValues ?? allRaws.map((r) => r.raw)),
    );
    let op = $state<ExcelConditionOp>(seedCondition?.op ?? "contains");
    let condValue = $state(seedCondition?.value ?? "");

    const visible = $derived.by(() => {
        const q = search.trim().toLowerCase();
        if (!q) return listed;
        return listed.filter(
            (r) =>
                r.label.toLowerCase().includes(q) ||
                r.raw.toLowerCase().includes(q),
        );
    });

    const allVisibleChecked = $derived(
        visible.length > 0 && visible.every((r) => checked.has(r.raw)),
    );
    const someVisibleChecked = $derived(visible.some((r) => checked.has(r.raw)));

    let selectAllEl: HTMLInputElement | undefined = $state();
    $effect(() => {
        if (selectAllEl) {
            selectAllEl.indeterminate =
                someVisibleChecked && !allVisibleChecked;
        }
    });

    function toggleVisible() {
        const next = new Set(checked);
        if (allVisibleChecked) {
            for (const r of visible) next.delete(r.raw);
        } else {
            for (const r of visible) next.add(r.raw);
        }
        checked = next;
    }

    function toggleValue(raw: string) {
        const next = new Set(checked);
        if (next.has(raw)) next.delete(raw);
        else next.add(raw);
        checked = next;
    }

    function applyValues() {
        if (checked.size >= allRaws.length) {
            onClear();
            return;
        }
        onApply({ kind: "values", values: [...checked] });
    }

    function applyCondition() {
        if (excelOpNeedsValue(op) && condValue.trim() === "") return;
        onApply({ kind: "condition", op, value: condValue });
    }

    function clearAll() {
        search = "";
        checked = new Set(allRaws.map((r) => r.raw));
        op = "contains";
        condValue = "";
        onClear();
    }
</script>

<div class="w-72">
    <div class="p-2 pb-0">
        <div
            class="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
            role="tablist"
            aria-label="Filter mode"
        >
            {#each [{ id: "values", label: "Values" }, { id: "condition", label: "Condition" }] as tab (tab.id)}
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === tab.id}
                    class="rounded px-2 py-1.5 text-[11px] font-medium transition-colors {mode ===
                    tab.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'}"
                    onclick={() =>
                        (mode = tab.id as "values" | "condition")}
                >
                    {tab.label}
                </button>
            {/each}
        </div>
    </div>

    {#if mode === "values"}
        <div class="space-y-1.5 p-2">
            <div class="relative">
                <SearchIcon
                    class="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    type="search"
                    value={search}
                    oninput={(e) => (search = e.currentTarget.value)}
                    placeholder="Search values…"
                    aria-label="Search values in {columnId}"
                    class="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
            </div>
            <label
                class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-accent"
            >
                <input
                    type="checkbox"
                    bind:this={selectAllEl}
                    checked={allVisibleChecked}
                    onchange={toggleVisible}
                    class="size-3.5 shrink-0 accent-primary"
                />
                <span class="min-w-0 flex-1 truncate">(Select All)</span>
                <span class="shrink-0 tabular-nums text-muted-foreground"
                    >{checked.size} of {allRaws.length}</span
                >
            </label>
        </div>
        <div class="max-h-56 overflow-y-auto border-t border-border p-1.5">
            {#each visible as r (r.raw)}
                <label
                    class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                    title={r.raw === "" ? "(Blanks)" : r.raw}
                >
                    <input
                        type="checkbox"
                        checked={checked.has(r.raw)}
                        onchange={() => toggleValue(r.raw)}
                        class="size-3.5 shrink-0 accent-primary"
                    />
                    <span class="min-w-0 flex-1 truncate">{r.label}</span>
                    <span
                        class="shrink-0 tabular-nums text-muted-foreground"
                        >{r.count}</span
                    >
                </label>
            {:else}
                <p class="px-2 py-4 text-xs text-muted-foreground">
                    {allRaws.length === 0
                        ? "No values in this column."
                        : "No values match."}
                </p>
            {/each}
            {#if truncated}
                <p class="px-2 py-1.5 text-[11px] text-muted-foreground">
                    Showing first {MAX_VALUES} of {allRaws.length} values —
                    use Condition for the rest.
                </p>
            {/if}
        </div>
    {:else}
        <div class="space-y-2 p-2">
            <label
                class="block text-[11px] font-medium text-muted-foreground"
                for="excel-cond-op">Operator</label
            >
            <select
                id="excel-cond-op"
                value={op}
                onchange={(e) =>
                    (op = (e.currentTarget as HTMLSelectElement)
                        .value as ExcelConditionOp)}
                class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
                {#each EXCEL_OPS as o (o.op)}
                    <option value={o.op}>{o.label}</option>
                {/each}
            </select>
            {#if excelOpNeedsValue(op)}
                <label
                    class="block text-[11px] font-medium text-muted-foreground"
                    for="excel-cond-value">Value</label
                >
                <input
                    id="excel-cond-value"
                    type="text"
                    value={condValue}
                    oninput={(e) => (condValue = e.currentTarget.value)}
                    onkeydown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            applyCondition();
                        }
                    }}
                    placeholder="Filter value…"
                    class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
            {/if}
        </div>
    {/if}

    <div class="flex items-center justify-end gap-1.5 border-t border-border p-2">
        <Button type="button" variant="ghost" size="xs" onclick={clearAll}>
            Clear
        </Button>
        <Button
            type="button"
            size="xs"
            disabled={mode === "condition" &&
                excelOpNeedsValue(op) &&
                condValue.trim() === ""}
            onclick={() => (mode === "values" ? applyValues() : applyCondition())}
        >
            Apply
        </Button>
    </div>
</div>
