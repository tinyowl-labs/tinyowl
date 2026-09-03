<script lang="ts">
    import { Handle, Position, useUpdateNodeInternals } from "@xyflow/svelte";
    import KeyRoundIcon from "@lucide/svelte/icons/key-round";
    import Table2Icon from "@lucide/svelte/icons/table-2";

    type Col = { name: string; type: string; pk?: boolean };
    type Data = {
        label: string;
        columns: Col[];
        count: number;
        highlighted?: string[];
    };

    let {
        id,
        data,
        selected = false,
    }: {
        id: string;
        data: Data;
        selected?: boolean;
    } = $props();

    const updateNodeInternals = useUpdateNodeInternals();
    const highlighted = $derived(new Set(data.highlighted ?? []));

    $effect(() => {
        data.columns;
        data.highlighted;
        queueMicrotask(() => updateNodeInternals(id));
    });

    function shortType(t: string): string {
        const u = t.replace(/\(.*\)/, "").trim().toUpperCase();
        if (u === "INTEGER") return "INT";
        if (u === "BOOLEAN") return "BOOL";
        if (u === "DATETIME" || u === "TIMESTAMP") return "DATE";
        if (u === "VARCHAR" || u === "CHARACTER") return "TEXT";
        if (u === "DOUBLE" || u === "FLOAT" || u === "NUMERIC") return "REAL";
        return u.slice(0, 8) || "—";
    }
</script>

<div
    class="w-[280px] overflow-visible rounded-xl border bg-card text-foreground shadow-md ring-1 ring-black/5 dark:ring-white/5
        {selected
        ? 'border-primary/50 shadow-lg shadow-primary/10'
        : 'border-border'}"
>
    <div
        class="flex items-center gap-2 rounded-t-xl border-b border-border bg-muted/50 px-3 py-2.5"
    >
        <Table2Icon class="size-3.5 shrink-0 text-muted-foreground" />
        <span
            class="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight"
            >{data.label}</span
        >
        <span
            class="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground ring-1 ring-border"
            >{data.count}</span
        >
    </div>
    <ul class="py-0.5">
        {#each data.columns as col}
            {@const linked = highlighted.has(col.name)}
            <li
                class="relative flex h-7 items-center gap-2 pr-3 pl-3 text-[11px]
                    {linked
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground'}"
            >
                {#if linked}
                    <span class="absolute inset-y-0 left-0 w-0.5 bg-primary"
                    ></span>
                    <span class="absolute inset-y-0 right-0 w-0.5 bg-primary"
                    ></span>
                {/if}
                <Handle
                    type="target"
                    id={`${col.name}__tl`}
                    position={Position.Left}
                    class="schema-handle !absolute !left-0 !top-1/2 !size-2 !border-0 !bg-transparent"
                    style="transform: translate(-50%, -50%)"
                />
                <Handle
                    type="source"
                    id={`${col.name}__sl`}
                    position={Position.Left}
                    class="schema-handle !absolute !left-0 !top-1/2 !size-2 !border-0 !bg-transparent"
                    style="transform: translate(-50%, -50%)"
                />
                <span class="flex min-w-0 flex-1 items-center gap-1.5 font-mono">
                    {#if col.pk}
                        <KeyRoundIcon class="size-3 shrink-0 text-primary" />
                    {:else}
                        <span class="size-3 shrink-0"></span>
                    {/if}
                    <span class="truncate">{col.name}</span>
                </span>
                <span
                    class="shrink-0 rounded px-1 py-px font-sans text-[9px] font-medium uppercase tracking-wider
                        {linked
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground/80'}"
                    >{shortType(col.type)}</span
                >
                <Handle
                    type="target"
                    id={`${col.name}__tr`}
                    position={Position.Right}
                    class="schema-handle !absolute !right-0 !left-auto !top-1/2 !size-2 !border-0 !bg-transparent"
                    style="transform: translate(50%, -50%)"
                />
                <Handle
                    type="source"
                    id={`${col.name}__sr`}
                    position={Position.Right}
                    class="schema-handle !absolute !right-0 !left-auto !top-1/2 !size-2 !border-0 !bg-transparent"
                    style="transform: translate(50%, -50%)"
                />
            </li>
        {/each}
    </ul>
</div>
